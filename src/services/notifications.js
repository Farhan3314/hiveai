import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
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

// NOTE: this used to be `where('userId', '==', userId)` combined with
// `orderBy('createdAt', 'desc')` in the SAME query. Firestore only serves an
// equality-filter + orderBy-on-a-different-field query like that from a
// COMPOSITE index — and this project never had one created for the
// `notifications` collection. Firestore doesn't silently ignore the
// orderBy in that case; it rejects the whole query with a
// `failed-precondition` error. On top of that, the onSnapshot error
// callback here used to be `() => callback([])` — it swallowed the error
// completely with no console output. End result: `createNotification`
// (group invite via email/friend-add, remove, left, etc.) wrote its
// Firestore doc just fine, but the recipient's NotificationsScreen listener
// failed on every single load and just showed an empty list — with nothing
// in the logs to explain why. That's the "invite email jata hai but
// notification app mein nahi aati" bug.
//
// Fix: drop `orderBy` from the query (equality-only filters don't need a
// composite index) and sort client-side instead — this needs zero Firebase
// console setup and can never silently fail this way again. The error
// callback now also logs, so any future permission/index problem shows up
// immediately instead of pretending "no notifications".
export function subscribeNotifications(userId, callback) {
  const q = query(collection(db, 'notifications'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const notifs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
      callback(notifs);
    },
    (err) => {
      console.error('[notifications] subscribeNotifications FAILED', {
        userId,
        code: err.code,
        message: err.message,
      });
      callback([]);
    }
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