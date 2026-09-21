// NOTE: Firebase config used to live here, sourced from EXPO_PUBLIC_FIREBASE_*
// env vars. It's now hardcoded directly in src/services/firebase.js instead —
// Firebase web/client config values aren't secrets (they ship inside every
// app bundle regardless), so there's no real need to route them through
// environment variables. The only value that stays in .env is the OpenRouter
// API key below, since that one IS a real secret.

// OpenRouter is the ONLY AI provider in this project.
export const OPENROUTER_API_KEY = (process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '').trim();

export const AI_BOT_NAME = 'HiveAI';

// Default free text model used for chat replies, summaries, action items
// and RAG answers.
export const AI_MODEL = process.env.EXPO_PUBLIC_AI_MODEL || 'nvidia/nemotron-3.5-lightning:free';
export const AI_FALLBACK_MODEL = process.env.EXPO_PUBLIC_AI_FALLBACK_MODEL || 'qwen/qwen3.8-27b:free';

// The text model above can't see images. This one can (image + text input),
// so it handles photo analysis in the AI Assistant and group chats.
export const AI_VISION_MODEL =
  process.env.EXPO_PUBLIC_AI_VISION_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';

// Free embedding model served through OpenRouter, used for the RAG pipeline
// (document chunk embeddings + question embeddings). 32k token context window
// keeps large chunks from being silently truncated.
export const EMBEDDING_MODEL =
  process.env.EXPO_PUBLIC_EMBEDDING_MODEL || 'nvidia/nemotron-3-embed-1b:free';

// File extensions we can reliably turn into plain text inside Expo Go without
// any native module (PDF/DOCX parsing needs native code or a backend, which
// this project intentionally doesn't use).
export const RAG_SUPPORTED_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'log'];

export const PLANS = {
  free: { name: 'Free', aiLimit: 50, price: 0 },
  pro: { name: 'Pro', aiLimit: 500, price: 9.99 },
  team: { name: 'Team', aiLimit: 2000, price: 29.99 },
};
