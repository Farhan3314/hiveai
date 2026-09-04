import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db } from './firebase';

// Each user's AI Assistant conversations live under users/{uid}/aiChats/{chatId},
// with individual messages in a `messages` subcollection underneath. This lets
// every person keep (and revisit) multiple separate AI conversations, the same
// way the group chats are stored.

function chatsRef(userId) {
  return collection(db, 'users', userId, 'aiChats');
}

function messagesRef(userId, chatId) {
  return collection(db, 'users', userId, 'aiChats', chatId, 'messages');
}

export function subscribeAIChats(userId, callback) {
  const q = query(chatsRef(userId), orderBy('updatedAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  );
}

export async function createAIChat(userId, firstMessageText) {
  const ref = await addDoc(chatsRef(userId), {
    title: (firstMessageText || 'New chat').trim().slice(0, 60),
    lastMessage: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeAIChatMessages(userId, chatId, callback) {
  const q = query(messagesRef(userId, chatId), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  );
}

export async function addAIChatMessage(
  userId,
  chatId,
  { senderId, senderName, type, text, fileUrl, fileName }
) {
  const msg = {
    senderId,
    senderName,
    type,
    text: text || '',
    createdAt: serverTimestamp(),
  };
  if (fileUrl) {
    msg.fileUrl = fileUrl;
    msg.fileName = fileName;
  }

  await addDoc(messagesRef(userId, chatId), msg);

  const preview = type === 'image' ? `📷 ${fileName || 'Photo'}` : type === 'file' ? `📎 ${fileName || 'File'}` : text;
  await updateDoc(doc(db, 'users', userId, 'aiChats', chatId), {
    lastMessage: (preview || '').slice(0, 100),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAIChat(userId, chatId) {
  const snap = await getDocs(messagesRef(userId, chatId));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'users', userId, 'aiChats', chatId));
}