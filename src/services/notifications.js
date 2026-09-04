import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { sendPushNotification } from './push';

export async function createNotification({
  userId,
  type,
  title,
  body,
  groupId,
  groupName,
  inviterUid,
  inviterName,
  status,
}) {
  console.log('[notifications] createNotification:', { userId, type, title });
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      type,
      title,
      body,
      groupId: groupId || null,
      groupName: groupName || null,
      // Only 'group_invite' notifications use these — they let the invited
      // user Accept/Decline right from the Notifications screen instead of
      // being silently added to the group.
      inviterUid: inviterUid || null,
      inviterName: inviterName || null,
      status: status || null,
      read: false,
      createdAt: serverTimestamp(),
    });
    console.log('[notifications] createNotification: Firestore doc written for', userId);
  } catch (e) {
    console.error('[notifications] createNotification FAILED', { userId, type, code: e.code, message: e.message });
    throw e;
  }

  // Fire the push notification alongside the in-app one. This covers all
  // four group-membership events (invite sent, invite accepted/joined,
  // removed, left) since every one of them calls createNotification.
  // Don't let a push failure break the in-app notification flow above —
  // sendPushNotification already logs its own errors internally.
  sendPushNotification(userId, { title, body, data: { type, groupId: groupId || null } });
}

export async function updateNotification(notifId, data) {
  await updateDoc(doc(db, 'notifications', notifId), data);
}

export function subscribeNotifications(userId, callback) {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  );
}

export async function markNotificationRead(notifId) {
  await updateDoc(doc(db, 'notifications', notifId), { read: true });
}

export async function markAllNotificationsRead(userId) {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    where('read', '==', false)
  );
  return new Promise((resolve) => {
    const unsub = onSnapshot(q, async (snap) => {
      unsub();
      await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { read: true })));
      resolve();
    });
  });
}