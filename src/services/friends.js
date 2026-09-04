import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import { findUserByEmail } from './users';
import { createNotification } from './notifications';

// NOTE: raw friendRequests docs store the two sides as fromUid/fromName/
// fromEmail and toUid/toName/toEmail (see sendFriendRequest below) — there's
// no plain `name`/`email` field on the doc itself. The Requests/Sent tabs in
// FriendsScreen (and the Avatar they render) read `friend.name`/`friend.email`,
// so without aliasing those fields here every incoming/outgoing request used
// to show up with a blank name, blank email, and a blank avatar. Add `uid`/
// `name`/`email` aliases pointing at "the other person" while keeping the
// original from*/to* fields intact for acceptFriendRequest/rejectFriendRequest.
export function subscribeFriendRequests(userId, callback) {
  const q = query(
    collection(db, 'friendRequests'),
    where('toUid', '==', userId),
    where('status', '==', 'pending')
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, uid: data.fromUid, name: data.fromName, email: data.fromEmail };
        })
      ),
    () => callback([])
  );
}

export function subscribeSentRequests(userId, callback) {
  const q = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', userId),
    where('status', '==', 'pending')
  );
  return onSnapshot(
    q,
    (snap) =>
      callback(
        snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, uid: data.toUid, name: data.toName, email: data.toEmail };
        })
      ),
    () => callback([])
  );
}

export function subscribeFriends(userId, callback) {
  const q = query(
    collection(db, 'friendships'),
    where('members', 'array-contains', userId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const friends = snap.docs.map((d) => {
        const data = d.data();
        const friend = data.userA.uid === userId ? data.userB : data.userA;
        return { id: d.id, ...friend };
      });
      callback(friends);
    },
    () => callback([])
  );
}

export async function sendFriendRequest(fromUser, toEmail) {
  const target = await findUserByEmail(toEmail);
  if (!target) return { success: false, error: 'No user was found with this email.' };
  if (target.uid === fromUser.uid) return { success: false, error: 'You cannot send a friend request to yourself.' };

  const existing = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', fromUser.uid),
    where('toUid', '==', target.uid),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(existing);
  if (!snap.empty) return { success: false, error: 'A friend request has already been sent.' };

  await addDoc(collection(db, 'friendRequests'), {
    fromUid: fromUser.uid,
    toUid: target.uid,
    fromName: fromUser.name,
    fromEmail: fromUser.email,
    toName: target.name,
    toEmail: target.email,
    status: 'pending',
    createdAt: serverTimestamp(),
  });

  await createNotification({
    userId: target.uid,
    type: 'friend_request',
    title: 'New friend request',
    body: `${fromUser.name} wants to connect`,
  });

  return { success: true };
}

export async function acceptFriendRequest(request) {
  await updateDoc(doc(db, 'friendRequests', request.id), { status: 'accepted' });
  await addDoc(collection(db, 'friendships'), {
    members: [request.fromUid, request.toUid],
    userA: { uid: request.fromUid, name: request.fromName, email: request.fromEmail },
    userB: { uid: request.toUid, name: request.toName, email: request.toEmail },
    createdAt: serverTimestamp(),
  });
  await createNotification({
    userId: request.fromUid,
    type: 'friend_accepted',
    title: 'Friend request accepted',
    body: `${request.toName} accepted your request`,
  });
}

export async function rejectFriendRequest(requestId) {
  await updateDoc(doc(db, 'friendRequests', requestId), { status: 'rejected' });
}
