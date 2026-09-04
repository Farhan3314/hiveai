import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db } from './firebase';
import { updateGroupLastMessage } from './groups';
import { generateAIReply, generateRAGAnswer } from './ai';
import { retrieveContext, hasReadyDocuments } from './rag';
import { incrementAIUsage } from './users';
import { createNotification } from './notifications';

export function subscribeMessages(groupId, callback) {
  const q = query(
    collection(db, 'groups', groupId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (err) => {
      console.warn('subscribeMessages error:', err.message);
      callback([]);
    }
  );
}

// One-off fetch (not a live subscription) of recent real chat messages for
// the AI Summary feature — excludes the ephemeral "AI is typing..." rows and
// caps at 100 messages so the summary prompt doesn't blow up on a huge group.
export async function getMessagesForSummary(groupId, max = 100) {
  const q = query(
    collection(db, 'groups', groupId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.type !== 'ai_typing');
}

export async function sendMessage(groupId, { text, senderId, senderName, type = 'text', fileUrl, fileName }) {  const preview = type === 'file' ? `📎 ${fileName || 'File'}` : text;
  const msg = {
    text: text || '',
    senderId,
    senderName,
    type,
    createdAt: serverTimestamp(),
  };
  if (fileUrl) {
    msg.fileUrl = fileUrl;
    msg.fileName = fileName;
  }
  await addDoc(collection(db, 'groups', groupId, 'messages'), msg);
  await updateGroupLastMessage(groupId, `${senderName}: ${preview.slice(0, 80)}`);

  // HiveAI now replies to every message in the group automatically — same
  // experience as the 1:1 AI Assistant chat. (Previously required an
  // explicit @HiveAI / @AI mention to trigger a reply.)
  if (type === 'text' && text?.trim()) {
    await handleAIMention(groupId, text, senderId, senderName);
  }
}

async function handleAIMention(groupId, userText, senderId, senderName) {
  const typingRef = await addDoc(collection(db, 'groups', groupId, 'messages'), {
    text: '',
    senderId: 'hiveai',
    senderName: 'HiveAI',
    type: 'ai_typing',
    createdAt: serverTimestamp(),
  });

  try {
    // If the group has documents that finished RAG processing, ground the
    // reply in retrieved passages instead of a generic answer (FR-019).
    const scopePath = `groups/${groupId}`;
    const usesDocs = await hasReadyDocuments(scopePath).catch(() => false);
    let reply;
    if (usesDocs) {
      const chunks = await retrieveContext({ scopePath, question: userText, topK: 4 });
      reply = chunks.length ? await generateRAGAnswer(userText, chunks) : await generateAIReply(userText);
    } else {
      reply = await generateAIReply(userText);
    }
    await incrementAIUsage(senderId, 1);

    await addDoc(collection(db, 'groups', groupId, 'messages'), {
      text: reply,
      senderId: 'hiveai',
      senderName: 'HiveAI',
      type: 'ai',
      createdAt: serverTimestamp(),
    });
    await updateGroupLastMessage(groupId, 'HiveAI: ' + reply.slice(0, 80));

    await createNotification({
      userId: senderId,
      type: 'ai_reply',
      title: 'HiveAI replied',
      body: reply.slice(0, 100),
      groupId,
    });
  } finally {
    const { deleteDoc, doc: firestoreDoc } = await import('firebase/firestore');
    await deleteDoc(firestoreDoc(db, 'groups', groupId, 'messages', typingRef.id)).catch(() => {});
  }
}