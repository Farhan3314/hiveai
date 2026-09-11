// NOTE: Firebase config used to live here, sourced from EXPO_PUBLIC_FIREBASE_*
// env vars. It's now hardcoded directly in src/services/firebase.js instead —
// Firebase web/client config values aren't secrets (they ship inside every
// app bundle regardless), so there's no real need to route them through
// environment variables. The only value that stays in .env is the OpenRouter
// API key below, since that one IS a real secret.

// OPENAI_API_KEY is intentionally NOT wired up via .env in this project setup
// (only OpenRouter is) — it stays here, defaulting to '', purely so
// services/ai.js's "OpenAI first, then OpenRouter" fallback logic keeps
// working unchanged if someone adds EXPO_PUBLIC_OPENAI_API_KEY back later.
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
