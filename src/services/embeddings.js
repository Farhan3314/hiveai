import { OPENROUTER_API_KEY, EMBEDDING_MODEL } from '../config';

// Embeddings only exist through OpenRouter in this project (no OpenAI key
// requirement, no backend) — this mirrors the free-model-only setup already
// used for chat replies in services/ai.js.
export function embeddingsAvailable() {
  return !!OPENROUTER_API_KEY;
}

// Calls OpenRouter's dedicated /embeddings endpoint. Accepts a single string
// or an array of strings and always returns an array of vectors (number[][])
// in the same order as the input, so callers don't need two code paths.
export async function embedTexts(input) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('EXPO_PUBLIC_OPENROUTER_API_KEY is required for RAG (embeddings).');
  }

  const texts = Array.isArray(input) ? input : [input];
  const cleaned = texts.map((t) => (t || '').toString().slice(0, 8000));

  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://hiveai.app',
      'X-Title': 'HiveAI',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: cleaned }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenRouter embeddings error ${res.status}`);
  }

  const data = await res.json();
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Unexpected embeddings response shape from OpenRouter.');
  }

  // OpenRouter returns items with an `index` field — sort defensively so the
  // output always lines up with the input order even if a provider reorders.
  return [...data.data]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((item) => item.embedding);
}

export async function embedOne(text) {
  const [vector] = await embedTexts([text]);
  return vector;
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
