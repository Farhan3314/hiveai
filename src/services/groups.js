import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
} from 'firebase/firestore';
import { db } from './firebase';

// Palette drawn from the app's own brand tokens (honey/teal) plus a couple
// of warm neighbors — variety for telling groups apart at a glance, without
// reintroducing the generic purple this app used to default to everywhere.
const GROUP_ICONS = [
  { icon: 'people', iconBg: '#E3A23A' },
  { icon: 'school-outline', iconBg: '#4CC2B9' },
  { icon: 'flame-outline', iconBg: '#C1583B' },
  { icon: 'happy-outline', iconBg: '#D9B44A' },
  { icon: 'rocket-outline', iconBg: '#7A8C4E' },
];

function pickRandomIcon() {
  return GROUP_ICONS[Math.floor(Math.random() * GROUP_ICONS.length)];
}

export function subscribeUserGroups(userId, callback) {
  const q = query(collection(db, 'groups'), where('memberIds', 'array-contains', userId));
  return onSnapshot(
    q,
    (snap) => {
      const groups = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.lastMessageAt?.toMillis?.() || 0;
          const bTime = b.lastMessageAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
      callback(groups);
    },
    (err) => {
      console.error('[groups] subscribeUserGroups FAILED', { userId, code: err.code, message: err.message });
      callback([]);
    }
  );
}

export async function createGroup({ name, createdBy, memberIds = [], creatorName }) {
  const { icon, iconBg } = pickRandomIcon();
  const allMembers = [...new Set([createdBy, ...memberIds])];
  try {
    const ref = await addDoc(collection(db, 'groups'), {
      name: name.trim(),
      memberIds: allMembers,
      membersCount: allMembers.length,
      createdBy,
      icon,
      iconBg,
      lastMessage: `${creatorName} created the group`,
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    console.log('[groups] createGroup: success', { groupId: ref.id, allMembers });
    return ref.id;
  } catch (e) {
    console.error('[groups] createGroup FAILED', { code: e.code, message: e.message });
    throw e;
  }
}

export async function getGroup(groupId) {
  const snap = await getDoc(doc(db, 'groups', groupId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// NOTE: membersCount used to be computed on the client from a stale
// snapshot value (`(currentCount || 0) + 1`) passed in from whichever
// screen happened to call this. Two people accepting an invite (or an
// admin adding someone while another add was in flight) would race and
// the count would end up wrong — or the whole update would look like it
// silently "didn't work" when the group doc had just changed underneath
// it. Firestore's atomic increment() fixes that: every add/remove is
// computed server-side off the true current value, no matter how many
// happen at once. The third argument is accepted (and ignored) so any
// existing call sites that still pass a count keep working.
export async function addMemberToGroup(groupId, userId) {
  console.log('[groups] addMemberToGroup: attempting', { groupId, userId });
  const ref = doc(db, 'groups', groupId);
  try {
    await updateDoc(ref, {
      memberIds: arrayUnion(userId),
      membersCount: increment(1),
    });
    console.log('[groups] addMemberToGroup: success', { groupId, userId });
  } catch (e) {
    // The #1 real-world cause of "member add nahi ho raha" is Firestore
    // Security Rules rejecting this write with permission-denied — most
    // commonly because the rules only allow updating a group doc if the
    // requester is ALREADY listed in memberIds, which is never true for
    // someone who is joining for the first time. Log the exact Firebase
    // error code/message so this is visible in the console instead of
    // silently failing, then re-throw so the calling screen can alert.
    console.error('[groups] addMemberToGroup FAILED', {
      groupId,
      userId,
      code: e.code,
      message: e.message,
    });
    throw e;
  }
}

// Removes a member from a group. Used both for an admin kicking someone out
// and for a member choosing to leave on their own (same underlying update).
export async function removeMemberFromGroup(groupId, userId) {
  console.log('[groups] removeMemberFromGroup: attempting', { groupId, userId });
  const ref = doc(db, 'groups', groupId);
  try {
    await updateDoc(ref, {
      memberIds: arrayRemove(userId),
      membersCount: increment(-1),
    });
    console.log('[groups] removeMemberFromGroup: success', { groupId, userId });
  } catch (e) {
    console.error('[groups] removeMemberFromGroup FAILED', {
      groupId,
      userId,
      code: e.code,
      message: e.message,
    });
    throw e;
  }
}

// A member removing themselves. Kept as a separate export so screens read
// clearly at the call site ("leaveGroup" vs "removeMemberFromGroup").
export async function leaveGroup(groupId, userId) {
  return removeMemberFromGroup(groupId, userId);
}

export function subscribeGroup(groupId, callback) {
  const ref = doc(db, 'groups', groupId);
  // IMPORTANT: this previously had no error handler at all. If Firestore
  // rejected the read (e.g. permission-denied), onSnapshot would fail
  // silently, `group` would stay null forever, and every screen guarding on
  // `if (!group) return` (invite/remove/leave buttons) would quietly stop
  // working with zero console output — indistinguishable from "nothing
  // happens when I tap the button". Logging the error here makes that
  // failure visible immediately.
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) callback({ id: snap.id, ...snap.data() });
      else callback(null);
    },
    (err) => {
      console.error('[groups] subscribeGroup FAILED', { groupId, code: err.code, message: err.message });
      callback(null);
    }
  );
}

export async function updateGroupLastMessage(groupId, lastMessage) {
  await updateDoc(doc(db, 'groups', groupId), {
    lastMessage,
    lastMessageAt: serverTimestamp(),
  });
}

// Permanently deletes a group: its messages subcollection first, then the
// group document itself. Firestore doesn't cascade-delete subcollections,
// so we have to clear them out manually from the client.
export async function deleteGroup(groupId) {
  const messagesSnap = await getDocs(collection(db, 'groups', groupId, 'messages'));
  await Promise.all(messagesSnap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'groups', groupId));
}