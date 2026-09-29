import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';


const firebaseConfig = {
  apiKey: "AIzaSyAKbidO8_USLDc7iEzlfLyuQU7iaGj-d50",
  authDomain: "hive-ai-e4c99.firebaseapp.com",
  projectId: "hive-ai-e4c99",
  storageBucket: "hive-ai-e4c99.firebasestorage.app",
  messagingSenderId: "423537112416",
  appId: "1:423537112416:web:315333f908a552763e5a05"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);


let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {

    auth = getAuth(app);
  }
}


let db;
if (Platform.OS === 'web') {
  db = getFirestore(app);
} else {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  });
}

// NOTE: Cloud Storage for Firebase is intentionally NOT initialized here.
// It requires the project to be upgraded to the Blaze (pay-as-you-go)
// billing plan — Google no longer allows provisioning or using Storage
// buckets on the free Spark plan at all, even if actual usage would stay
// within its no-cost quota. This project stays on Spark, so chat/AI
// attachments are embedded as base64 straight into Firestore documents
// instead — see services/storage.js for the size limits that keeps this
// within Firestore's 1 MiB per-document cap.

export { app, auth, db };