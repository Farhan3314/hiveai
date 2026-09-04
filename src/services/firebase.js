import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { FIREBASE_CONFIG } from '../config';


const firebaseConfig = {
  apiKey: FIREBASE_CONFIG.apiKey,
  authDomain: FIREBASE_CONFIG.authDomain,
  projectId: FIREBASE_CONFIG.projectId,
  storageBucket: FIREBASE_CONFIG.storageBucket,
  messagingSenderId: FIREBASE_CONFIG.messagingSenderId,
  appId: FIREBASE_CONFIG.appId,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// On native (iOS/Android) we need AsyncStorage persistence so the user
// stays logged in between app restarts. On web, getAuth's default
// persistence is fine.
let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    // initializeAuth throws if it was already called (e.g. fast refresh) —
    // fall back to the existing instance.
    auth = getAuth(app);
  }
}

// Firestore's default transport uses gRPC-style streaming (WebChannel),
// which many mobile networks, VPNs, corporate proxies, and Android
// emulators silently break — the symptom is exactly the error being fixed
// here: "Could not reach Cloud Firestore backend... client will operate
// in offline mode". Long polling (plain HTTP requests) is far more
// firewall/proxy-friendly and is Firebase's own documented workaround for
// React Native. auto-detect tries streaming first and falls back to long
// polling only if needed, so this doesn't slow down connections that work
// fine as-is.
let db;
if (Platform.OS === 'web') {
  db = getFirestore(app);
} else {
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false,
  });
}

// NOTE: Firebase Storage (paid/Blaze plan) has been removed from this project.
// Files (avatars, chat attachments) are now converted to base64 data URIs on
// the device and stored directly as Firestore fields — see src/services/storage.js.
export { app, auth, db };