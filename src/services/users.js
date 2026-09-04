import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export async function ensureUserProfile(firebaseUser) {
  const ref = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || '',
      email: firebaseUser.email || '',
      photoURL: firebaseUser.photoURL || null,
      plan: 'free',
      aiTokensUsed: 0,
      createdAt: serverTimestamp(),
    });
    return {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || '',
      email: firebaseUser.email || '',
      photoURL: firebaseUser.photoURL || null,
      plan: 'free',
      aiTokensUsed: 0,
    };
  }
  const data = snap.data();
  // Firebase Auth (updateProfile) is the source of truth for name/photo right after
  // a save — if the Firestore doc is missing/stale (e.g. an earlier sync failed),
  // fall back to what Auth actually has instead of silently showing old data.
  return {
    uid: firebaseUser.uid,
    ...data,
    name: data.name || firebaseUser.displayName || '',
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
  const q = query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function incrementAIUsage(uid, amount = 1) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const current = snap.data()?.aiTokensUsed || 0;
  await updateDoc(ref, { aiTokensUsed: current + amount });
  return current + amount;
}