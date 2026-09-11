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
import { updateGroupLastMessage, getGroup } from './groups';
import { generateAIReply, generateRAGAnswer, aiLimitReachedMessage } from './ai';
import { retrieveContext, hasReadyDocuments } from './rag';
import { incrementAIUsage, checkAIUsageLimit } from './users';
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

export async function sendMessage(groupId, { text, senderId, senderName, type = 'text', fileUrl, fileName }) {
  const preview = type === 'file' ? `📎 ${fileName || 'File'}` : text;
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


  if (type === 'text' && text?.trim()) {
    await handleAIMention(groupId, text, senderId, senderName);
  }
}

async function handleAIMention(groupId, userText, senderId, senderName) {
  // Check the sender's plan limit BEFORE spending a real (paid) AI call —
  // the AI Usage screen already showed "limit reached", but nothing
  // previously stopped the actual API request from firing once someone
  // was over it.
  const { allowed, plan, limit } = await checkAIUsageLimit(senderId).catch(() => ({ allowed: true }));

  const typingRef = await addDoc(collection(db, 'groups', groupId, 'messages'), {
    text: '',
    senderId: 'hiveai',
    senderName: 'HiveAI',
    type: 'ai_typing',
    createdAt: serverTimestamp(),
  });

  try {
    let reply;
    let consumedRequest = false;

    if (!allowed) {
      reply = aiLimitReachedMessage(plan, limit);
    } else {
      const scopePath = `groups/${groupId}`;
      const usesDocs = await hasReadyDocuments(scopePath).catch(() => false);
      if (usesDocs) {
        const chunks = await retrieveContext({ scopePath, question: userText, topK: 4 });
        reply = chunks.length
          ? await generateRAGAnswer(userText, chunks)
          : await generateAIReply(userText, senderName);
      } else {
        reply = await generateAIReply(userText, senderName);
      }
      consumedRequest = true;
    }

    if (consumedRequest) {
      await incrementAIUsage(senderId, 1);
    }

    // Tag which message/sender this reply is answering. In a busy group,
    // several people can send messages within moments of each other — each
    // gets its own independent AI reply (no shared/overwritten state), but
    // without this tag it's easy to lose track of which reply answers which
    // message once they're interleaved in the list.
    await addDoc(collection(db, 'groups', groupId, 'messages'), {
      text: reply,
      senderId: 'hiveai',
      senderName: 'HiveAI',
      type: 'ai',
      replyToSenderName: senderName,
      replyToText: userText.slice(0, 120),
      createdAt: serverTimestamp(),
    });
    await updateGroupLastMessage(groupId, 'HiveAI: ' + reply.slice(0, 80));

    // Notify every other group member that HiveAI replied, not just the
    // person who sent the message that triggered it — otherwise the rest
    // of the group only finds out by opening the chat.
    const group = await getGroup(groupId).catch(() => null);
    const recipients = (group?.memberIds || []).filter((uid) => uid !== senderId);
    await Promise.all(
      recipients.map((uid) =>
        createNotification({
          userId: uid,
          type: 'ai_reply',
          title: 'HiveAI replied',
          body: reply.slice(0, 100),
          groupId,
          groupName: group?.name,
        }).catch(() => {})
      )
    );
  } finally {
    const { deleteDoc, doc: firestoreDoc } = await import('firebase/firestore');
    await deleteDoc(firestoreDoc(db, 'groups', groupId, 'messages', typingRef.id)).catch(() => {});
  }
}