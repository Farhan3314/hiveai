import {
  collection,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { AI_BOT_NAME } from '../config';
import { updateGroupLastMessage } from './groups';
import { checkAIUsageLimit, incrementAIUsage } from './users';
import { logAIUsage } from './usageTracking';
import { hasReadyDocuments, retrieveContext } from './rag';
import {
  generateAIReply,
  generateRAGAnswer,
  generateConversationSummary,
  extractActionItems,
  detectAICommand,
  aiCommandHelpMessage,
  aiLimitReachedMessage,
} from './ai';

// BUGFIX: this file used to be an accidental near-duplicate of services/ai.js
// (same OpenRouter call plumbing, no actual messaging code) instead of the
// real Firestore message CRUD it's supposed to contain. GroupChatScreen,
// ActionItemsScreen and ConversationSummaryScreen all import
// subscribeMessages/sendMessage/getMessagesForSummary from THIS file — none
// of those were ever exported, so opening any group chat crashed immediately
// with "subscribeMessages is not a function". All AI reply generation
// (generateAIReply, generateRAGAnswer, etc.) belongs solely in services/ai.js
// — this file only orchestrates *when* to call it for a group message.

const MENTION_RE = /@(?:HiveAI|AI)\b/i;
// How many of the most recent real messages to hand to the AI as
// short-term conversation memory (mirrors AIAssistantScreen's history slice).
const HISTORY_LIMIT = 8;
// How many messages getMessagesForSummary pulls for /summarize + /tasks —
// bounded so a very long-lived group doesn't try to summarize thousands of
// messages in one prompt (generateConversationSummary/extractActionItems
// already truncate the transcript text itself, this just bounds the read).
const SUMMARY_MESSAGE_LIMIT = 200;

function messagesCollection(groupId) {
  return collection(db, 'groups', groupId, 'messages');
}

function isRealMessage(m) {
  return m.type !== 'ai_typing' && !!m.text && !!m.text.trim();
}

function previewFor(type, text, fileName) {
  if (type === 'image') return `📷 ${fileName || 'Photo'}`;
  if (type === 'file') return `📎 ${fileName || 'File'}`;
  return (text || '').trim();
}

// Live subscription to a group's messages, oldest first (what
// GroupChatScreen's FlatList expects). Logs and falls back to an empty list
// on failure instead of leaving the screen stuck with no explanation — same
// pattern as subscribeGroup/subscribeNotifications elsewhere in this app.
export function subscribeMessages(groupId, callback) {
  const q = query(messagesCollection(groupId), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('[messages] subscribeMessages FAILED', { groupId, code: err.code, message: err.message });
      callback([]);
    }
  );
}

// One-time fetch used by ActionItemsScreen/ConversationSummaryScreen (and
// internally for the /summarize and /tasks commands below) — a live
// subscription isn't needed for a single "generate a summary now" action.
export async function getMessagesForSummary(groupId) {
  const q = query(messagesCollection(groupId), orderBy('createdAt', 'asc'), limit(SUMMARY_MESSAGE_LIMIT));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data()).filter(isRealMessage);
}

// Writes a message (text, image, or file — see GroupChatScreen) and updates
// the group's lastMessage/lastMessageAt preview. If the text contains an
// @HiveAI/@AI mention, kicks off the AI reply flow WITHOUT awaiting it —
// the reply can take up to ~45s (see services/ai.js), and this function's
// caller (GroupChatScreen's `sending` state) should only wait on the user's
// own message actually being written, not on HiveAI's answer.
export async function sendMessage(groupId, { senderId, senderName, text = '', type = 'text', fileUrl, fileName }) {
  const trimmedText = (text || '').trim();

  const payload = {
    senderId,
    senderName,
    type,
    text: trimmedText,
    createdAt: serverTimestamp(),
  };
  if (fileUrl) {
    payload.fileUrl = fileUrl;
    payload.fileName = fileName;
  }

  await addDoc(messagesCollection(groupId), payload);

  const preview = previewFor(type, trimmedText, fileName);
  await updateGroupLastMessage(groupId, senderName ? `${senderName}: ${preview}` : preview);

  if (trimmedText && MENTION_RE.test(trimmedText)) {
    // Fire-and-forget: errors are already handled (and a fallback message
    // posted) inside triggerAIReply itself, so this .catch is just a safety
    // net against anything escaping that — it must never surface as an
    // unhandled promise rejection or block the sender's UI.
    triggerAIReply(groupId, { senderId, senderName, text: trimmedText }).catch((e) =>
      console.error('[messages] triggerAIReply FAILED (non-fatal)', { groupId, code: e.code, message: e.message })
    );
  }
}

// Recent real messages, oldest first, for conversation-memory context —
// same idea as AIAssistantScreen's `history` slice, just read from
// Firestore instead of component state since group members share one
// message list rather than each holding their own.
async function fetchRecentHistory(groupId) {
  const q = query(messagesCollection(groupId), orderBy('createdAt', 'desc'), limit(HISTORY_LIMIT));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data())
    .filter(isRealMessage)
    .reverse()
    .map((m) => ({ senderId: m.senderId, senderName: m.senderName, text: m.text }));
}

// Runs the full @HiveAI reply flow for one mention: shows a typing
// placeholder every group member can see, checks the sender's monthly AI
// limit, routes to /summarize, /tasks, /help, RAG (if the group has
// documents uploaded), or a plain conversational reply, then swaps the
// placeholder for the real answer and logs usage — mirroring
// AIAssistantScreen's generateAndSendReply, adapted for a shared Firestore
// message list instead of local component state.
async function triggerAIReply(groupId, { senderId, senderName, text }) {
  const typingRef = await addDoc(messagesCollection(groupId), {
    senderId: 'hiveai',
    senderName: AI_BOT_NAME,
    type: 'ai_typing',
    text: '',
    createdAt: serverTimestamp(),
  });

  try {
    const { allowed, plan, limit: usageLimit } = await checkAIUsageLimit(senderId);

    let reply;
    let sources = [];
    let category = 'group_mention';
    let skipUsage = false;

    if (!allowed) {
      reply = aiLimitReachedMessage(plan, usageLimit);
      skipUsage = true;
    } else {
      const command = detectAICommand(text);

      if (command?.command === 'help') {
        reply = aiCommandHelpMessage();
        skipUsage = true; // no AI provider call made, nothing to meter
      } else if (command?.command === 'summarize') {
        category = 'summary';
        const transcript = await getMessagesForSummary(groupId);
        reply = await generateConversationSummary(transcript);
      } else if (command?.command === 'tasks') {
        category = 'action_items';
        const transcript = await getMessagesForSummary(groupId);
        reply = await extractActionItems(transcript);
      } else {
        const scopePath = `groups/${groupId}`;
        const usesDocs = await hasReadyDocuments(scopePath).catch(() => false);
        if (usesDocs) {
          const chunks = await retrieveContext({ scopePath, question: text, topK: 4 });
          if (chunks.length) {
            const result = await generateRAGAnswer(text, chunks);
            reply = result.text;
            sources = result.sources;
          } else {
            const history = await fetchRecentHistory(groupId);
            reply = await generateAIReply(text, senderName, history);
          }
        } else {
          const history = await fetchRecentHistory(groupId);
          reply = await generateAIReply(text, senderName, history);
        }
      }

      if (!skipUsage) {
        await incrementAIUsage(senderId, 1).catch((e) =>
          console.error('[messages] incrementAIUsage FAILED (non-fatal):', e.code, e.message)
        );
        await logAIUsage({
          userId: senderId,
          groupId,
          category,
          model: category,
          inputText: text,
          outputText: reply,
          subscriptionPlan: plan,
        });
      }
    }

    await deleteDoc(typingRef);
    await addDoc(messagesCollection(groupId), {
      senderId: 'hiveai',
      senderName: AI_BOT_NAME,
      type: 'ai',
      text: reply,
      ...(sources.length ? { sources } : {}),
      createdAt: serverTimestamp(),
    });
    await updateGroupLastMessage(groupId, `${AI_BOT_NAME}: ${(reply || '').slice(0, 100)}`);
  } catch (e) {
    console.error('[messages] triggerAIReply error:', e);
    await deleteDoc(typingRef).catch(() => {});
    const fallback = "Sorry, I ran into a problem answering that just now. Please try again in a moment 🙏";
    await addDoc(messagesCollection(groupId), {
      senderId: 'hiveai',
      senderName: AI_BOT_NAME,
      type: 'ai',
      text: fallback,
      createdAt: serverTimestamp(),
    }).catch(() => {});
    await updateGroupLastMessage(groupId, `${AI_BOT_NAME}: ${fallback}`).catch(() => {});
    throw e;
  }
}
