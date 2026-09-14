import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, increment } from 'firebase/firestore';
import { db } from './firebase';
import { PLANS } from '../config';

export async function ensureUserProfile(firebaseUser) {
  const ref = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);
  // NOTE: Firebase Auth preserves whatever case the person typed at sign-up
  // ("John@Gmail.com" stays "John@Gmail.com" on firebaseUser.email) — it
  // only case-folds internally for its own sign-in matching. findUserByEmail
  // (below) always lowercases the search term, so any user doc whose stored
  // email wasn't ALSO lowercased could never be found by a friend request —
  // this was the real cause of "invitation feature doesn't work": people
  // could sign up fine, but nobody could ever find them by email afterwards.
  // Storing a dedicated `emailLower` field (in addition to the original-case
  // `email`, kept for display) makes the search reliable regardless of the
  // casing used at sign-up or at search time.
  const emailLower = (firebaseUser.email || '').trim().toLowerCase();
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || '',
      email: firebaseUser.email || '',
      emailLower,
      photoURL: firebaseUser.photoURL || null,
      plan: 'free',
      aiTokensUsed: 0,
      createdAt: serverTimestamp(),
    });
    return {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || '',
      email: firebaseUser.email || '',
      emailLower,
      photoURL: firebaseUser.photoURL || null,
      plan: 'free',
      aiTokensUsed: 0,
    };
  }
  const data = snap.data();
  // Backfill emailLower for accounts created before this field existed, and
  // self-heal any doc that's missing it or went stale — merge so nothing
  // else on the doc is touched. Fire-and-forget: never block returning the
  // profile on this housekeeping write.
  if (data.emailLower !== emailLower && emailLower) {
    setDoc(ref, { emailLower }, { merge: true }).catch(() => {});
  }
  // Firebase Auth (updateProfile) is the source of truth for name/photo right after
  // a save — if the Firestore doc is missing/stale (e.g. an earlier sync failed),
  // fall back to what Auth actually has instead of silently showing old data.
  return {
    uid: firebaseUser.uid,
    ...data,
    name: data.name || firebaseUser.displayName || '',
    emailLower: data.emailLower || emailLower,
    photoURL: data.photoURL !== undefined && data.photoURL !== null ? data.photoURL : firebaseUser.photoURL || null,
  };
}

export async function updateUserDoc(uid, data) {
  const ref = doc(db, 'users', uid);
  // setDoc + merge instead of updateDoc: updateDoc throws if the document
  // doesn't exist yet, which is exactly the case right after sign-up (the
  // profile doc hasn't been created yet). That failure was being silently
  // swallowed by callers, but it still cost a full network round trip for
  // nothing — merge just creates-or-updates in one shot.
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function findUserByEmail(email) {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  const byLower = query(collection(db, 'users'), where('emailLower', '==', target));
  let snap = await getDocs(byLower);

  // Fallback for any pre-existing account whose doc predates emailLower and
  // hasn't logged in since (so ensureUserProfile hasn't backfilled it yet).
  // Matches only the exact original-case email, which still catches the
  // common case of everyone typing lowercase.
  if (snap.empty) {
    const byExact = query(collection(db, 'users'), where('email', '==', target));
    snap = await getDocs(byExact);
  }

  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// Uses Firestore's atomic increment() instead of read-then-write. The old
// version did getDoc() -> updateDoc(current + amount), which loses updates
// when two increments for the same user land close together (e.g. two group
// messages triggering AI replies within the same second) — increment() is
// computed server-side off the true current value, so concurrent calls never
// clobber each other.
export async function incrementAIUsage(uid, amount = 1) {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { aiTokensUsed: increment(amount) });
}

// Checks whether a user still has AI requests left on their plan this month,
// WITHOUT spending one. Every place that's about to call a real AI provider
// (group chat, AI Assistant tab, file analysis, etc.) should call this first
// — previously only the AI Usage screen showed "limit reached", but nothing
// actually stopped a paid API call from firing once someone was over it.
export async function checkAIUsageLimit(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const data = snap.data() || {};
  const plan = data.plan || 'free';
  const used = data.aiTokensUsed || 0;
  const limit = PLANS[plan]?.aiLimit ?? PLANS.free.aiLimit;
  return { allowed: used < limit, used, limit, plan };
}