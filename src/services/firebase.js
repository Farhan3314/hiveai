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

export { app, auth, db };