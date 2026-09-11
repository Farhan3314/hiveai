import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../services/firebase';
import { ensureUserProfile, updateUserDoc } from '../services/users';
import { registerForPushNotificationsAsync, savePushToken } from '../services/push';

const AuthContext = createContext();

// Friendly messages for the most common Firebase Auth error codes.
function friendlyAuthError(error) {
  const code = error?.code || '';
  const map = {
    'auth/email-already-in-use': 'This email is already registered. Please log in.',
    'auth/invalid-email': 'The email format is invalid.',
    'auth/weak-password': 'Password must be at least 6 characters long.',
    'auth/user-not-found': 'No account was found with this email.',
    'auth/wrong-password': 'The password is incorrect.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error — please check your internet connection.',
  };
  return map[code] || error?.message || 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [initializing, setInitializing] = useState(true); // first auth check on app boot

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Show the app immediately with whatever Firebase Auth already
        // knows (uid/email/displayName) instead of blocking navigation on
        // a Firestore round trip first — this is what made login/sign-up
        // feel like a long freeze on a slow connection. The fuller profile
        // (plan, aiTokensUsed, saved photo, etc.) fills in a moment later
        // once ensureUserProfile resolves, without holding up the switch
        // away from the Auth screens.
        setUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || '',
          email: firebaseUser.email || '',
          photoURL: firebaseUser.photoURL || null,
          plan: 'free',
          aiTokensUsed: 0,
        });
        setInitializing(false);

        // Register this device for push notifications and save the token
        // against this user's Firestore doc so other users' devices can
        // look it up when they need to notify this person (group invite,
        // added/joined, removed, left). Fire-and-forget — never blocks
        // login, and every step logs to the console with a [push] prefix.
        registerForPushNotificationsAsync()
          .then((token) => {
            if (token) savePushToken(firebaseUser.uid, token);
          })
          .catch((e) => console.error('[push] registration flow failed:', e.message));

        const profile = await ensureUserProfile(firebaseUser).catch(() => null);
        if (profile) {
          setUser({
            uid: firebaseUser.uid,
            name: profile.name || firebaseUser.displayName || '',
            email: profile.email || firebaseUser.email || '',
            photoURL: profile.photoURL || firebaseUser.photoURL || null,
            plan: profile.plan || 'free',
            aiTokensUsed: profile.aiTokensUsed || 0,
          });
        }
      } else {
        setUser(null);
        setInitializing(false);
      }
    });
    return unsubscribe;
  }, []);

  const login = async (email, password) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // onAuthStateChanged will pick up the new user and update state,
      // which flips RootNavigator over to the main app.
      return { success: true };
    } catch (error) {
      return { success: false, error: friendlyAuthError(error) };
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (fullName, email, password) => {
    setIsLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // These two writes are independent (Auth profile vs Firestore doc),
      // so run them in parallel instead of one after another — this was
      // previously two sequential network round trips, which is a big part
      // of why sign-up felt slow.
      await Promise.all([
        fullName ? updateProfile(credential.user, { displayName: fullName }) : Promise.resolve(),
        updateUserDoc(credential.user.uid, {
          name: fullName,
          email: email.trim().toLowerCase(),
        }).catch(() => { }),
      ]);
      setUser({
        uid: credential.user.uid,
        name: fullName,
        email: credential.user.email,
        photoURL: null,
        plan: 'free',
        aiTokensUsed: 0,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: friendlyAuthError(error) };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { success: true };
    } catch (error) {
      return { success: false, error: friendlyAuthError(error) };
    }
  };

  // Used by EditProfileScreen — updates the display name on Firebase Auth and
  // saves both name + photo on the Firestore user doc, then mirrors the
  // change into local `user` state so it shows up immediately everywhere.
  //
  // NOTE: Firebase Auth's updateProfile() rejects any photoURL longer than
  // ~2048 characters (auth/invalid-profile-attribute). Since avatars are now
  // stored as base64 data URIs (hundreds of KB), we never pass photoURL to
  // Auth — only displayName. Firestore has no such length limit, so the
  // actual photo lives there and is treated as the source of truth
  // (see ensureUserProfile in services/users.js).
  const updateUserProfile = async ({ name, photoURL }) => {
    setIsLoading(true);
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: name });
        // Don't swallow this error — if it fails (e.g. Firestore rules/network),
        // the photo will look updated this session but revert on next app load,
        // since ensureUserProfile reads from this doc. Surface it instead.
        await updateUserDoc(auth.currentUser.uid, {
          name,
          photoURL: photoURL ?? null,
        });
      }
      setUser((prev) => (prev ? { ...prev, name, photoURL: photoURL ?? null } : prev));
      return { success: true };
    } catch (error) {
      console.error('updateUserProfile error:', error);
      return { success: false, error: friendlyAuthError(error) };
    } finally {
      setIsLoading(false);
    }
  };

  const value = useMemo(
    () => ({ user, isLoading, initializing, login, signup, logout, resetPassword, updateUserProfile }),
    [user, isLoading, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}