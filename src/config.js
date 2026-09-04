export const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

const firebaseConfig = {
  apiKey: FIREBASE_CONFIG.apiKey,
  authDomain: FIREBASE_CONFIG.authDomain,
  projectId: FIREBASE_CONFIG.projectId,
  storageBucket: FIREBASE_CONFIG.storageBucket,
  messagingSenderId: FIREBASE_CONFIG.messagingSenderId,
  appId: FIREBASE_CONFIG.appId,
};

export { firebaseConfig };

export const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
export const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';

export const AI_BOT_NAME = 'HiveAI';

// Free embedding model served through OpenRouter, used for the RAG pipeline
// (document chunk embeddings + question embeddings). 32k token context window
// keeps large chunks from being silently truncated.
export const EMBEDDING_MODEL = 'nvidia/nemotron-3-embed-1b:free';

// File extensions we can reliably turn into plain text inside Expo Go without
// any native module (PDF/DOCX parsing needs native code or a backend, which
// this project intentionally doesn't use).
export const RAG_SUPPORTED_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'log'];

export const PLANS = {
  free: { name: 'Free', aiLimit: 50, price: 0 },
  pro: { name: 'Pro', aiLimit: 500, price: 9.99 },
  team: { name: 'Team', aiLimit: 2000, price: 29.99 },
};
