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
//
// `openrouter/free` is OpenRouter's own router: it picks a currently-healthy
// free model on every request instead of always hitting one fixed model. We
// used to default straight to `nvidia/nemotron-3.5-lightning:free`, but that
// model is hosted by exactly ONE backing provider (no automatic failover), so
// whenever that single host was slow/overloaded every request timed out
// after the full 45s with nowhere else to go. Routing through the free-model
// router avoids that single point of failure.
export const AI_MODEL = process.env.EXPO_PUBLIC_AI_MODEL || 'openrouter/free';
// Fallback stays a concrete (non-router) model on purpose: if the router
// itself has an off moment, retrying with the SAME router could just land on
// the same struggling model again. Nemotron 3 Ultra is one of OpenRouter's
// most-used free models, so it's less likely to be idle/cold.
export const AI_FALLBACK_MODEL =
  process.env.EXPO_PUBLIC_AI_FALLBACK_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

// The text model above can't see images. This one can (image + text input),
// so it handles photo analysis in the AI Assistant and group chats.
export const AI_VISION_MODEL =
  process.env.EXPO_PUBLIC_AI_VISION_MODEL || 'qwen/qwen3.8-27b:free';
// Tried in order when the model above fails (busy / 429 / retired / not
// allowed for API use). On top of this list the app also asks OpenRouter which
// free image-capable models exist right now (see services/ai.js), so a retired
// slug can never break image analysis again. Override with a comma-separated
// env var; put a PAID model first here (e.g. google/gemma-3-27b-it) for
// rock-solid results.
export const AI_VISION_FALLBACK_MODELS = (
  process.env.EXPO_PUBLIC_AI_VISION_FALLBACK_MODELS ||
  'dots-studio/dots-3-note-preview:free,nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free,openrouter/free'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

// OPTIONAL second FREE provider: Google Gemini (Google AI Studio). It has its
// own free quota, separate from OpenRouter's shared free pool, so chat, photo
// and document answers keep working when OpenRouter's free models are busy.
// Free key (no card): https://aistudio.google.com/apikey
// Leave empty to keep using OpenRouter only.
export const GEMINI_API_KEY = (process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();
// Used when the app can't fetch Gemini's live model list. Both accept images.
export const GEMINI_MODELS = (
  process.env.EXPO_PUBLIC_GEMINI_MODELS || 'gemini-2.5-flash-lite,gemini-2.5-flash'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

// Extra free TEXT models tried (after AI_MODEL and AI_FALLBACK_MODEL) for chat
// replies, document answers, summaries and action items.
export const AI_TEXT_FALLBACK_MODELS = (
  process.env.EXPO_PUBLIC_AI_TEXT_FALLBACK_MODELS ||
  'nvidia/nemotron-3-super-120b-a12b:free,qwen/qwen3.8-27b:free,nvidia/nemotron-3.5-lightning:free,poolside/laguna-s-2.1:free'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

// Free embedding model served through OpenRouter, used for the RAG pipeline
// (document chunk embeddings + question embeddings). 32k token context window
// keeps large chunks from being silently truncated.
export const EMBEDDING_MODEL =
  process.env.EXPO_PUBLIC_EMBEDDING_MODEL || 'nvidia/nemotron-3-embed-1b:free';

// File extensions the document Q&A (RAG) can read. txt-like files are read
// directly; .docx and .pdf are parsed on-device with pure JS (no native
// module, works in Expo Go) — see services/textExtractCore.js. Scanned
// (image-only) or password-protected PDFs can't be read and show a clear error.
export const RAG_SUPPORTED_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'log', 'docx', 'pdf'];

// MIME types offered by the system file picker for "Document".
// '*/*' on purpose: on many Android phones a list of specific MIME types makes
// the system picker grey out (un-selectable) PDF/Word/.md/.log files whose
// MIME type is reported as application/octet-stream. The extension is checked
// right after picking instead (see validateAttachment in services/storage.js).
export const DOCUMENT_PICKER_TYPES = ['*/*'];

// Documents up to this many characters are sent to the chat model directly
// (no embeddings, no Firestore round trips) — faster, and it doesn't depend on
// the free embedding model being up. Longer ones use the RAG pipeline.
export const DOCUMENT_DIRECT_MAX_CHARS = 14000;

// Upload limits (single source of truth — shown to users in error messages).
export const UPLOAD_LIMITS = {
  // Photos: picked file can be up to this size; it is then compressed on-device.
  imagePickedMaxBytes: 25 * 1024 * 1024,
  // Documents the AI can read: text is extracted on the device, so the file
  // itself can be larger than what fits inside a chat message.
  documentAnalysisMaxBytes: 8 * 1024 * 1024,
  // A document's raw bytes are embedded in the Firestore message (1 MiB doc
  // limit, base64 = +33%). Bigger files are still analysed, just not stored.
  documentStoredMaxBytes: 700 * 1024,
  // Max characters of extracted text that get indexed for Q&A.
  documentTextMaxChars: 200000,
};

export const PLANS = {
  free: { name: 'Free', aiLimit: 50, price: 0 },
  pro: { name: 'Pro', aiLimit: 500, price: 9.99 },
  team: { name: 'Team', aiLimit: 2000, price: 29.99 },
};