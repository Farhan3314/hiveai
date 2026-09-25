import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import { findUserByEmail } from './users';
import { createNotification, updateNotification } from './notifications';

// Any 'friend_request' notification created for this friendRequests doc
// (there's normally exactly one, but never assume) is flipped to match the
// request's final status so the Notifications screen never keeps showing
// stale Accept/Decline buttons for a request that's already been resolved
// from the Friends screen instead.
async function syncFriendRequestNotifications(requestId, recipientUid, status) {
  const q = query(
    collection(db, 'notifications'),
    where('requestId', '==', requestId),
    where('userId', '==', recipientUid)
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => updateNotification(d.id, { status, read: true })));
}

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

// This used to only check fromUid==me && toUid==them && pending. That misses
// the (very common) case where THEY already sent YOU a request first — you'd
// end up creating a second, opposite-direction pending doc instead of just
// connecting, so both people saw the other stuck in a different tab forever
// with nothing to accept. It also never checked for an existing friendship,
// so re-adding a current friend silently spawned a duplicate "Sent" request.
// Both are fixed here: an already-sent-to-you request is auto-accepted
// instead of duplicated, and existing friends get a clear error.
export async function sendFriendRequest(fromUser, toEmail) {
  console.log('[friends] sendFriendRequest: start', { from: fromUser.uid, toEmail });

  const target = await findUserByEmail(toEmail);
  if (!target) {
    console.log('[friends] sendFriendRequest: no user found for', toEmail);
    return { success: false, error: 'No user was found with this email.' };
  }
  if (target.uid === fromUser.uid) {
    console.log('[friends] sendFriendRequest: blocked — sender emailed themselves', fromUser.uid);
    return { success: false, error: 'You cannot send a friend request to yourself.' };
  }

  const alreadyFriends = await getDocs(
    query(collection(db, 'friendships'), where('members', 'array-contains', fromUser.uid))
  );
  if (alreadyFriends.docs.some((d) => d.data().members.includes(target.uid))) {
    console.log('[friends] sendFriendRequest: already friends', { from: fromUser.uid, to: target.uid });
    return { success: false, error: `You and ${target.name || 'this user'} are already friends.` };
  }

  const outgoing = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', fromUser.uid),
    where('toUid', '==', target.uid),
    where('status', '==', 'pending')
  );
  const outgoingSnap = await getDocs(outgoing);
  if (!outgoingSnap.empty) {
    console.log('[friends] sendFriendRequest: duplicate outgoing request already pending', { from: fromUser.uid, to: target.uid });
    return { success: false, error: 'A friend request has already been sent.' };
  }

  const incoming = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', target.uid),
    where('toUid', '==', fromUser.uid),
    where('status', '==', 'pending')
  );
  const incomingSnap = await getDocs(incoming);
  if (!incomingSnap.empty) {
    // They already asked to add us — accept theirs instead of creating a
    // duplicate reverse request that would just sit unseen in our "Sent" tab.
    console.log('[friends] sendFriendRequest: found reverse pending request, auto-accepting instead', {
      requestId: incomingSnap.docs[0].id,
    });
    await acceptFriendRequest(incomingSnap.docs[0].id);
    return { success: true, alreadyFriends: true };
  }

  let requestRef;
  try {
    requestRef = await addDoc(collection(db, 'friendRequests'), {
      fromUid: fromUser.uid,
      toUid: target.uid,
      fromName: fromUser.name,
      fromEmail: fromUser.email,
      toName: target.name,
      toEmail: target.email,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    console.log('[friends] sendFriendRequest: friendRequests doc written', requestRef.id);
  } catch (e) {
    console.error('[friends] sendFriendRequest: FAILED writing friendRequests doc', {
      from: fromUser.uid,
      to: target.uid,
      code: e.code,
      message: e.message,
    });
    throw e;
  }

  try {
    await createNotification({
      userId: target.uid,
      type: 'friend_request',
      title: 'New friend request',
      body: `${fromUser.name} wants to connect`,
      inviterUid: fromUser.uid,
      inviterName: fromUser.name,
      requestId: requestRef.id,
      status: 'pending',
    });
    console.log('[friends] sendFriendRequest: notification created for', target.uid);
  } catch (e) {
    // The request doc itself is already written and visible in the
    // recipient's Requests tab (subscribeFriendRequests) — don't fail the
    // whole "Send" action just because the notification side-effect choked.
    console.error('[friends] sendFriendRequest: notification FAILED (request still sent)', {
      to: target.uid,
      code: e.code,
      message: e.message,
    });
  }

  console.log('[friends] sendFriendRequest: done', { from: fromUser.uid, to: target.uid });
  return { success: true };
}

// Takes just the requestId (not a whole pre-shaped object) so this can be
// called equally from FriendsScreen's Requests tab (which has the full
// friendRequest row already) and from a tapped Notification (which only
// carries requestId + inviterUid/inviterName). Reading the request doc here
// is the single source of truth for the from/to details, instead of trusting
// whatever partial shape each caller happens to have on hand.
export async function acceptFriendRequest(requestId) {
  console.log('[friends] acceptFriendRequest: start', requestId);
  const ref = doc(db, 'friendRequests', requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.error('[friends] acceptFriendRequest: request doc missing', requestId);
    throw new Error('This friend request no longer exists.');
  }
  const request = snap.data();
  if (request.status === 'accepted') {
    console.log('[friends] acceptFriendRequest: already accepted, skipping (double-tap)', requestId);
    return; // already handled (e.g. double-tap)
  }

  await updateDoc(ref, { status: 'accepted' });
  console.log('[friends] acceptFriendRequest: status set to accepted', requestId);
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
  await syncFriendRequestNotifications(requestId, request.toUid, 'accepted');
  console.log('[friends] acceptFriendRequest: done, friendship created for', request.fromUid, request.toUid);
}

export async function rejectFriendRequest(requestId) {
  console.log('[friends] rejectFriendRequest: start', requestId);
  const ref = doc(db, 'friendRequests', requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.log('[friends] rejectFriendRequest: request doc missing, nothing to do', requestId);
    return;
  }
  const request = snap.data();
  await updateDoc(ref, { status: 'rejected' });
  await syncFriendRequestNotifications(requestId, request.toUid, 'declined');
  console.log('[friends] rejectFriendRequest: done', requestId);
}