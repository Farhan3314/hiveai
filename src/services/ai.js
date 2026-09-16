import { AI_BOT_NAME, OPENROUTER_API_KEY, AI_MODEL, AI_VISION_MODEL } from '../config';


// Free-tier models (OpenRouter's `:free` models especially) can sit queued
// for a long time under load with no error — just silence. Without a
// timeout, a slow/stuck request left the group chat's "HiveAI is typing…"
// indicator spinning indefinitely, which looked identical to "AI ka
// response nahi aata". Aborting after a bounded time turns that into a
// fast, clear error instead (caught by aiFailureHint below) so the user at
// least gets a reply telling them to try again, instead of waiting forever.
const AI_REQUEST_TIMEOUT_MS = 20000;

// Every reply in this app comes from OpenRouter — there is no demo/offline
// mode and no second provider. If the key is missing the app says so plainly
// instead of returning canned text that looks like a real AI answer.
function missingKeyMessage() {
  return `${AI_BOT_NAME} is not configured yet — EXPO_PUBLIC_OPENROUTER_API_KEY is missing. Add your OpenRouter key to .env (or to the EAS environment variables for a build) and restart the app.`;
}

async function fetchWithTimeout(url, options, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenRouter(messages, maxTokens, model = AI_MODEL) {
  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://hiveai.app',
      'X-Title': 'HiveAI',
    },

    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      reasoning: { enabled: false },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenRouter API error ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

// Calls OpenRouter, the only AI provider this project uses.
async function callAIProvider(messages, maxTokens) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('EXPO_PUBLIC_OPENROUTER_API_KEY is not configured.');
  }
  return await callOpenRouter(messages, maxTokens);
}

// Shown instead of calling a real (paid) AI provider once a user is over
// their plan's monthly AI request limit.
export function aiLimitReachedMessage(plan, limit) {
  const planName = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'Free';
  return `You've hit your ${planName} plan's limit of ${limit} AI requests this month, so I can't reply right now. Upgrade your plan from Settings → AI Usage to keep chatting with me 🙏`;
}

// Detects a slash-style or plain-language AI command inside an @HiveAI /
// @AI mention (README Phase 5: "AI commands"). Returns null when the
// message is just a normal question, so callers can fall back to the
// regular conversational/RAG reply path unchanged.
export function detectAICommand(userMessage) {
  const cleaned = (userMessage || '').replace(/@(?:HiveAI|AI)\b/gi, '').trim();
  const lower = cleaned.toLowerCase();

  if (/^\/summarize\b/.test(lower) || /^(summarize|summary)\b/.test(lower)) {
    return { command: 'summarize' };
  }
  if (/^\/tasks\b/.test(lower) || /^(tasks|action items|extract tasks)\b/.test(lower)) {
    return { command: 'tasks' };
  }
  if (/^\/help\b/.test(lower) || lower === 'help') {
    return { command: 'help' };
  }
  return null;
}

export function aiCommandHelpMessage() {
  return (
    `Here's what I can do:\n\n` +
    `• Just @HiveAI + a question — I'll answer using the conversation (and any uploaded documents)\n` +
    `• @HiveAI summarize — key takeaways from this chat\n` +
    `• @HiveAI tasks — pull out action items and open questions\n` +
    `• @HiveAI help — show this list`
  );
}

// conversationHistory: optional array of { senderName, text } from the most
// recent messages, oldest first. Passing this gives the AI real short-term
// memory of the conversation (README Phase 5: "AI conversation memory")
// instead of answering each mention in total isolation.
export async function generateAIReply(userMessage, senderName, conversationHistory = []) {
  const cleaned = userMessage.replace(/@(?:HiveAI|AI)\b/gi, '').trim();

  const promptText = cleaned || userMessage.trim() || 'Hello';

  if (!OPENROUTER_API_KEY) {
    return missingKeyMessage();
  }

  // Naming the sender matters in a group chat: several people can message
  // within moments of each other, and each gets a separate AI reply, so
  // telling the model who's asking keeps its wording (e.g. "Hey <name>...")
  // clearly tied to the right person instead of reading as generic.
  const senderContext = senderName ? ` You're replying to a group chat message from ${senderName}.` : '';
  const systemPrompt = `You are ${AI_BOT_NAME}, a helpful AI teammate in a group chat app.${senderContext} Be concise, friendly, and practical. Reply in the same language the user uses (English or Urdu). Use the recent conversation history (if provided) to stay on topic and avoid re-asking things already covered. Always write at least one sentence back, even for a short greeting like "hi" or "hello" — never return an empty reply.`;

  // Turn the last few real messages into actual chat turns instead of one
  // flattened block of text, so the model can follow who said what.
  const historyMessages = (conversationHistory || [])
    .slice(-8)
    .filter((m) => m && m.text && m.text.trim())
    .map((m) => ({
      role: m.senderId === 'hiveai' ? 'assistant' : 'user',
      content: m.senderId === 'hiveai' ? m.text : `${m.senderName || 'Someone'}: ${m.text}`,
    }));

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: promptText },
  ];

  try {
    // 350 tokens is plenty for a group-chat-style answer and generates
    // noticeably faster than 400+ on the free models this app defaults to.
    // Only retry with a larger budget on the rare empty-reply case — most
    // requests never touch this second call at all.
    let reply = await callAIProvider(chatMessages, 350);

    if (!reply || !reply.trim()) {
      reply = await callAIProvider(chatMessages, 600);
    }

    return (reply && reply.trim()) || `Hey! 👋 I'm ${AI_BOT_NAME} — how can I help?`;
  } catch (e) {
    // Never put e.message directly in a chat message — it can contain raw
    // provider/API text (keys, internal error codes, etc.) that has no
    // business being shown to end users in a group chat. Log the real error
    // for debugging and send back a friendly, generic fallback instead.
    console.error('generateAIReply error:', e);
    return `Sorry, I ran into a problem answering that just now. Please try again in a moment 🙏${aiFailureHint(e)}`;
  }
}

// Turns the caught error into a short, SAFE-to-show category hint appended
// to the generic failure message above — no keys, no raw provider text,
// just enough for whoever's testing the build to know where to look. This
// exists because a build (unlike Expo Go, where you can watch the Metro
// terminal) usually has no visible console, so without this the exact same
// generic "I ran into a problem" message shows up whether the real cause is
// a missing/invalid API key, no internet, or the provider being down —
// three completely different fixes that were previously indistinguishable
// from inside the app itself.
function aiFailureHint(e) {
  const msg = String(e?.message || '').toLowerCase();

  if (/401|unauthorized|invalid.*(api.?key|credentials)|no auth credentials/.test(msg)) {
    return '\n\n_(debug: AI provider rejected the API key — check that EXPO_PUBLIC_OPENROUTER_API_KEY is set correctly for this build, e.g. via EAS environment variables, then rebuild.)_';
  }
  if (/network request failed|failed to fetch|timed out|timeout/.test(msg)) {
    return '\n\n_(debug: could not reach the AI provider — check the device has a working internet connection.)_';
  }
  if (/429|rate.?limit/.test(msg)) {
    return '\n\n_(debug: AI provider rate-limited this request — the free model is temporarily overloaded, try again shortly.)_';
  }
  if (/5\d\d/.test(msg)) {
    return '\n\n_(debug: AI provider returned a server error — likely temporary on their end.)_';
  }
  return '';
}


// Builds the de-duplicated "Sources" list shown under a RAG answer
// (README Phase 4: "source citations"). Chunks are already sorted by
// relevance by retrieveContext(); this keeps the first (best) score seen
// per file rather than listing every chunk from the same document.
function buildSources(contextChunks) {
  const byFile = new Map();
  contextChunks.forEach((c, i) => {
    if (!byFile.has(c.fileName)) {
      byFile.set(c.fileName, { fileName: c.fileName, score: c.score, refIndex: i + 1 });
    }
  });
  return Array.from(byFile.values());
}

// Returns { text, sources } instead of a bare string so the UI can render a
// "Sources" section under the answer (README Phase 4: "source citations").
export async function generateRAGAnswer(question, contextChunks) {
  if (!contextChunks || contextChunks.length === 0) {
    return {
      text: "I couldn't find anything relevant to that in the uploaded document(s). Try rephrasing, or upload a document that covers this topic.",
      sources: [],
    };
  }

  const sources = buildSources(contextChunks);
  const contextBlock = contextChunks
    .map((c, i) => `[${i + 1}] (from ${c.fileName})\n${c.text}`)
    .join('\n\n');

  if (!OPENROUTER_API_KEY) {
    return {
      text: missingKeyMessage(),
      sources,
    };
  }

  try {
    const reply = await callAIProvider(
      [
        {
          role: 'system',
          content: `You are ${AI_BOT_NAME}. Answer the user's question using ONLY the numbered context passages below, which come from documents they uploaded. Cite passages inline like [1]. If the passages don't contain the answer, say so clearly instead of guessing.\n\nContext:\n${contextBlock}`,
        },
        { role: 'user', content: question },
      ],
      500
    );
    return { text: reply || 'Could not generate an answer.', sources };
  } catch (e) {
    console.error('generateRAGAnswer error:', e);
    return {
      text: `Sorry, I couldn't read through the document(s) just now. Please try again in a moment 🙏`,
      sources,
    };
  }
}


// Returns { text, model } instead of a bare string so callers
// (AIAssistantScreen, messages.js) can log usage/analytics against the model
// that actually answered, keeping the AI Usage screen's per-model breakdown
// accurate.
export async function analyzeImageContent(fileName, base64DataUrl, userPrompt) {
  if (!OPENROUTER_API_KEY) {
    return {
      text: missingKeyMessage(),
      model: 'none',
    };
  }

  const promptText = userPrompt?.trim()
    ? `${userPrompt.trim()} (file name: ${fileName})`
    : `Please analyze this image (file name: ${fileName}).`;

  const visionMessages = [
    {
      role: 'system',
      content: `You are ${AI_BOT_NAME}, a helpful AI teammate. Describe and analyze the image the user shared. Be concise and practical. Reply in the same language the user's prompt uses (English or Urdu).`,
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: promptText },
        { type: 'image_url', image_url: { url: base64DataUrl } },
      ],
    },
  ];

  try {
    const reply = await callOpenRouter(visionMessages, 400, AI_VISION_MODEL);
    return { text: reply?.trim() || 'Could not analyze the image.', model: AI_VISION_MODEL };
  } catch (e) {
    console.error('analyzeImageContent error:', e);
    return {
      text: `Sorry, I couldn't analyze that image just now. Please try again in a moment 🙏`,
      model: AI_VISION_MODEL,
    };
  }
}

// Summarizes a group chat's recent messages into key takeaways. Used by
// ConversationSummaryScreen ("AI Summary").
export async function generateConversationSummary(messages) {
  const realMessages = (messages || []).filter((m) => m.text && m.text.trim());

  if (realMessages.length === 0) {
    return "There's nothing to summarize yet — send a few messages in this group first.";
  }

  const transcript = realMessages
    .map((m) => `${m.senderName || 'Someone'}: ${m.text}`)
    .join('\n')
    .slice(0, 6000); // keep the prompt bounded for very long histories

  if (!OPENROUTER_API_KEY) {
    return missingKeyMessage();
  }

  try {
    const reply = await callAIProvider(
      [
        {
          role: 'system',
          content: `You are ${AI_BOT_NAME}. Summarize this group chat conversation into: 1) A short overview 2) Key points/decisions 3) Any action items or open questions. Be concise and use plain language.`,
        },
        { role: 'user', content: transcript },
      ],
      500
    );
    return reply || 'Could not generate a summary.';
  } catch (e) {
    console.error('generateConversationSummary error:', e);
    return `Sorry, I couldn't summarize this conversation just now. Please try again in a moment 🙏`;
  }
}

// Pulls out concrete action items / open questions from a group chat
// (README Phase 5: "action-item extraction" + "AI task generation"). Used
// by both the "tasks" AI command (@HiveAI tasks) and a dedicated screen.
export async function extractActionItems(messages) {
  const realMessages = (messages || []).filter((m) => m.text && m.text.trim());

  if (realMessages.length === 0) {
    return "There's nothing to extract yet — send a few messages in this group first.";
  }

  const transcript = realMessages
    .map((m) => `${m.senderName || 'Someone'}: ${m.text}`)
    .join('\n')
    .slice(0, 6000);

  if (!OPENROUTER_API_KEY) {
    return missingKeyMessage();
  }

  try {
    const reply = await callAIProvider(
      [
        {
          role: 'system',
          content: `You are ${AI_BOT_NAME}. Read this group chat conversation and pull out a checklist of concrete action items (things someone needs to do), each with the person responsible if it's clear from context. Then list any open questions that haven't been answered yet. Format as:\n\n✅ Action Items\n- ...\n\n❓ Open Questions\n- ...\n\nIf there are none of either, say so plainly instead of inventing any. Be concise.`,
        },
        { role: 'user', content: transcript },
      ],
      500
    );
    return reply || 'Could not extract action items.';
  } catch (e) {
    console.error('extractActionItems error:', e);
    return `Sorry, I couldn't extract action items just now. Please try again in a moment 🙏`;
  }
}
