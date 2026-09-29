import { AI_BOT_NAME, OPENROUTER_API_KEY, AI_MODEL, AI_FALLBACK_MODEL, AI_VISION_MODEL, AI_VISION_FALLBACK_MODELS, AI_TEXT_FALLBACK_MODELS, GEMINI_API_KEY, GEMINI_MODELS } from '../config';


export const AI_SERVICE_VERSION = 'v9-2026-09-29';
console.log(`[ai] service loaded (${AI_SERVICE_VERSION})`);

// Free reasoning models (Nemotron / Qwen "thinking") can take well over 20s to
// answer, especially on a cold start. The old 20s limit aborted those calls.
const AI_REQUEST_TIMEOUT_MS = 45000;
const AI_MAX_RETRIES = 1;

// Errors that mean "the network hiccuped", not "the request is wrong". Expo's
// fetch reports an aborted request as "fetch failed: Fetch request has been
// canceled" (NOT an AbortError), which the old code failed to recognise — so a
// slow reply was treated as a fatal error and the fallback model never ran.
const TRANSIENT_NETWORK_RE =
  /network request failed|failed to fetch|fetch failed|cancell?ed|aborted|timed out|timeout|socket|connection (reset|closed|lost)|econnreset/i;


function missingKeyMessage() {
  return `${AI_BOT_NAME} is not configured yet — EXPO_PUBLIC_OPENROUTER_API_KEY is missing. Add your OpenRouter key to .env (or to the EAS environment variables for a build) and restart the app.`;
}

function makeTimeoutError(timeoutMs) {
  const error = new Error(`Request timed out after ${timeoutMs / 1000}s`);
  error.retryable = true;
  error.timedOut = true;
  return error;
}

// Sends the request AND reads the whole body under one timeout. (Previously
// only the headers were covered, so a stalled body read could hang forever and
// leave "HiveAI is typing…" on screen.)
async function fetchTextWithTimeout(url, options, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const requestOptions = controller ? { ...options, signal: controller.signal } : options;
  let timer;
  let timedOut = false;

  const work = (async () => {
    const res = await fetch(url, requestOptions);
    const body = await res.text();
    return { res, body };
  })();
  // If the timeout wins the race, the aborted request rejects later — swallow
  // that so it doesn't surface as an unhandled promise rejection.
  work.catch(() => {});

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      if (controller) controller.abort();
      reject(makeTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } catch (e) {
    if (timedOut) throw makeTimeoutError(timeoutMs);
    if (TRANSIENT_NETWORK_RE.test(`${e?.name || ''} ${e?.message || ''}`)) e.retryable = true;
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Only the assistant's real answer. We deliberately do NOT fall back to
// `message.reasoning` any more — that is the model's private chain-of-thought
// and showed up as a garbled "reply" whenever the answer itself came back empty.
function getResponseText(data) {
  const message = data?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((part) => typeof part?.text === 'string' || typeof part?.content === 'string')
      .map((part) => part.text || part.content)
      .join('')
      .trim();
  }
  if (typeof data?.choices?.[0]?.text === 'string') return data.choices[0].text.trim();
  return '';
}

function isRetryableProviderError(error) {
  return error?.retryable === true || /^(408|425|429|5\d\d)$/.test(String(error?.status || ''));
}

// Chain entries that start with this prefix are sent to Google's free Gemini
// API (OpenAI-compatible endpoint) instead of OpenRouter.
const GEMINI_PREFIX = 'gemini:';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

async function callOpenRouter(messages, maxTokens, model = AI_MODEL, maxRetries = AI_MAX_RETRIES, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const isGemini = model.startsWith(GEMINI_PREFIX);
      const request = isGemini
        ? {
            url: `${GEMINI_BASE}/chat/completions`,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GEMINI_API_KEY}` },
            // reasoning_effort keeps "thinking" from eating the answer budget.
            body: { model: model.slice(GEMINI_PREFIX.length), messages, max_tokens: maxTokens, reasoning_effort: 'low' },
          }
        : {
            url: 'https://openrouter.ai/api/v1/chat/completions',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${OPENROUTER_API_KEY}`,
              'HTTP-Referer': 'https://hiveai.app',
              'X-Title': 'HiveAI',
            },
            body: {
              model,
              messages,
              max_tokens: maxTokens,
              provider: { allow_fallbacks: true },
              // "Thinking" models (Qwen 3.x, Dots, Nemotron…) can spend the whole
              // token budget on hidden reasoning and return an EMPTY answer
              // (finish_reason: length). Ask for minimal reasoning; models that
              // don't support the option simply ignore it.
              reasoning: { effort: 'low' },
            },
          };
      const { res, body: rawBody } = await fetchTextWithTimeout(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
      }, timeoutMs);

      let data = {};
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
        if (Array.isArray(data)) data = data[0] || {};
      } catch {
        const error = new Error(`AI provider returned an invalid response (HTTP ${res.status}).`);
        error.status = res.status;
        error.retryable = true;
        throw error;
      }

      // OpenRouter can answer HTTP 200 with an `error` object in the body when
      // the upstream provider fails mid-request — treat that as a failure too.
      if (!res.ok || data?.error) {
        const status = res.ok ? Number(data?.error?.code) || 502 : res.status;
        const error = new Error(data?.error?.message || `OpenRouter API error ${status}`);
        error.status = status;
        error.retryable = status === 408 || status === 425 || status === 429 || status >= 500;
        // OpenRouter's :free models share ONE daily request budget (50/day
        // until $10 of credits were ever bought). When that is used up every
        // free model fails the same way, so retrying / falling back only
        // wastes more quota.
        const detail = `${data?.error?.message || ''} ${JSON.stringify(data?.error?.metadata || {})}`;
        error.dailyLimit = status === 429 && /per-day|per day|daily/i.test(detail);
        throw error;
      }

      const text = getResponseText(data);
      if (!text) {
        const finish = data?.choices?.[0]?.finish_reason || 'unknown';
        const error = new Error(`OpenRouter returned an empty response (finish_reason: ${finish}).`);
        error.retryable = true;
        throw error;
      }
      return text;
    } catch (error) {
      lastError = error;
      // Expected while free models are busy — the caller moves on to the next
      // model, so this is only logged (not a yellow warning box).
      console.log('[ai] request failed', {
        model,
        attempt: attempt + 1,
        status: error?.status,
        message: String(error?.message || '').slice(0, 200),
      });
      // A timeout means this model is too slow right now — retrying the same
      // model just burns another full timeout, so go straight to the fallback.
      if (!isRetryableProviderError(error) || error.timedOut || error.dailyLimit || error.status === 429 || attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, (error?.status >= 500 ? 2000 : 700) * (attempt + 1)));
    }
  }

  throw lastError || new Error('AI provider request failed.');
}

// ---------------------------------------------------------------------------
// Model chain: try several models until one answers.
// Free OpenRouter models are often busy (429), full (502), retired (404) or
// restricted (403 "only available on agentic harnesses"). One failing model
// must never end the request, so we walk down a list, skip models that are
// permanently unusable this session, and make a second pass after a short wait
// when everything was only temporarily busy.
// ---------------------------------------------------------------------------
let geminiDisabled = false;
const deadModels = new Set(); // 400/402/403/404 — will not work, don't retry this session
const CHAIN_BUDGET_MS = 90000;
const CHAIN_ATTEMPT_TIMEOUT_MS = 30000; // one slow model must not eat the whole budget
const COOLDOWN_MS = 90000;
const cooldownUntil = new Map(); // model -> timestamp; busy (429/5xx/empty) models are skipped for a while
const hasAnyKey = () => !!(OPENROUTER_API_KEY || GEMINI_API_KEY);
const LAST_RESORT_RE = /nemotron-3-nano-omni/; // single-host, usually full
const CHAIN_PASS_DELAY_MS = 2500;

function isKeyProblem(e) {
  if (e?.gemini) return false; // a wrong Gemini key just disables Gemini (see runModelChain)
  const status = Number(e?.status);
  const msg = String(e?.message || '');
  return status === 401 || (status === 403 && /api.?key|credential|unauthori[sz]ed|invalid key|no auth/i.test(msg));
}

function isPermanentModelProblem(e) {
  return [400, 402, 403, 404].includes(Number(e?.status)) && !isKeyProblem(e);
}

let discoveredPromise = null;
// Asks OpenRouter which free models exist right now (public endpoint, no key
// needed). kind: 'vision' (accepts images) or 'text'. Cached for the session.
function discoverFreeModels() {
  if (!discoveredPromise) {
    discoveredPromise = (async () => {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => controller && controller.abort(), 8000);
        const res = await fetch('https://openrouter.ai/api/v1/models', controller ? { signal: controller.signal } : undefined);
        clearTimeout(timer);
        const json = await res.json();
        return (json?.data || [])
          .filter((m) => typeof m?.id === 'string' && m.id.endsWith(':free'))
          .filter((m) => (m?.architecture?.output_modalities || ['text']).includes('text'))
          .map((m) => ({
            id: m.id,
            vision: (m?.architecture?.input_modalities || []).includes('image'),
            text: (m?.architecture?.input_modalities || ['text']).includes('text'),
          }));
      } catch (e) {
        console.warn('[ai] could not fetch the free model list:', String(e?.message || e).slice(0, 120));
        return [];
      }
    })();
  }
  return discoveredPromise;
}

let geminiListPromise = null;
// Picks the newest stable Flash-Lite and Flash models from Gemini's live list
// (model names change over time); falls back to GEMINI_MODELS from config.
function geminiModelIds() {
  if (!geminiListPromise) {
    geminiListPromise = (async () => {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => controller && controller.abort(), 8000);
        const res = await fetch(`${GEMINI_BASE}/models`, {
          headers: { Authorization: `Bearer ${GEMINI_API_KEY}` },
          ...(controller ? { signal: controller.signal } : {}),
        });
        clearTimeout(timer);
        const json = await res.json();
        const ids = (json?.data || [])
          .map((m) => String(m?.id || '').replace(/^models\//, ''))
          .filter((id) => /^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(id));
        const version = (id) => parseFloat(id.match(/^gemini-(\d+(?:\.\d+)?)/)[1]);
        const newest = (list) => list.sort((a, b) => version(b) - version(a))[0];
        const lite = newest(ids.filter((id) => id.endsWith('-lite')));
        const flash = newest(ids.filter((id) => !id.endsWith('-lite')));
        return [lite, flash].filter(Boolean);
      } catch (e) {
        return [];
      }
    })();
  }
  return geminiListPromise.then((live) => Array.from(new Set([...live, ...GEMINI_MODELS])));
}

async function buildChain(preferred, kind) {
  const chain = [];
  const add = (id) => {
    if (id && !chain.includes(id)) chain.push(id);
  };
  // Gemini's own free quota goes first when a key is configured: it is the
  // most reliable free option and doesn't share OpenRouter's busy free pool.
  if (GEMINI_API_KEY && !geminiDisabled) {
    (await geminiModelIds()).forEach((id) => add(`${GEMINI_PREFIX}${id}`));
  }
  preferred.forEach(add);
  const discovered = await discoverFreeModels();
  let extra = discovered.filter((m) => (kind === 'vision' ? m.vision : m.text)).map((m) => m.id);
  extra = extra.filter((id) => !/embed|rerank|guard|audio|tts|speech|image-gen/i.test(id));
  extra.slice(0, 6).forEach(add);
  // Models that are usually overloaded go to the very end.
  return [...chain.filter((id) => !LAST_RESORT_RE.test(id)), ...chain.filter((id) => LAST_RESORT_RE.test(id))];
}

async function runModelChain(models, attemptFn, { passes = 2 } = {}) {
  const startedAt = Date.now();
  const usable = models.filter((m) => !deadModels.has(m) && !(geminiDisabled && m.startsWith(GEMINI_PREFIX)));
  let lastError;

  for (let pass = 0; pass < passes; pass += 1) {
    // Pass 1 skips models that failed recently (in earlier requests) so we
    // don't keep hammering a busy model — unless that would leave nothing to
    // try. Pass 2 retries everything that isn't permanently unusable.
    const now = Date.now();
    const alive = usable.filter((m) => !deadModels.has(m) && !(geminiDisabled && m.startsWith(GEMINI_PREFIX)));
    const fresh = alive.filter((m) => (cooldownUntil.get(m) || 0) <= now);
    const candidates = pass === 0 && fresh.length > 0 ? fresh : alive;
    let sawTemporary = false;

    for (const model of candidates) {
      if (geminiDisabled && model.startsWith(GEMINI_PREFIX)) continue;
      if (Date.now() - startedAt > CHAIN_BUDGET_MS) {
        console.warn('[ai] AI request took too long, giving up');
        throw lastError || new Error('AI request took too long.');
      }
      try {
        return await attemptFn(model);
      } catch (e) {
        lastError = e;
        if (model.startsWith(GEMINI_PREFIX)) {
          e.gemini = true;
          if ([400, 401, 403].includes(Number(e?.status)) && /api.?key|permission|credential|unauthori[sz]ed/i.test(String(e?.message))) {
            geminiDisabled = true; // bad/missing Gemini key: stop trying Gemini this session
            console.warn('[ai] Gemini key was rejected — check EXPO_PUBLIC_GEMINI_API_KEY. Using OpenRouter only.');
          }
        }
        console.log('[ai] model unavailable, trying next one', { model, status: e?.status });
        if (isKeyProblem(e) || e?.dailyLimit) throw e;
        if (isPermanentModelProblem(e)) deadModels.add(model);
        else {
          sawTemporary = true;
          cooldownUntil.set(model, Date.now() + COOLDOWN_MS);
        }
      }
    }

    if (!sawTemporary) break; // nothing worth retrying
    if (pass < passes - 1) await new Promise((resolve) => setTimeout(resolve, CHAIN_PASS_DELAY_MS));
  }

  console.warn('[ai] all AI models are busy right now:', String(lastError?.message || '').slice(0, 120));
  throw lastError || new Error('No AI model is available right now.');
}

// Calls OpenRouter, the only AI provider this project uses.
async function callAIProvider(messages, maxTokens) {
  if (!hasAnyKey()) {
    throw new Error('EXPO_PUBLIC_OPENROUTER_API_KEY is not configured.');
  }
  const models = await buildChain([AI_MODEL, AI_FALLBACK_MODEL, ...AI_TEXT_FALLBACK_MODELS], 'text');
  return runModelChain(models, (model) => callOpenRouter(messages, Math.max(maxTokens, 2048), model, 0, CHAIN_ATTEMPT_TIMEOUT_MS));
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
  const safeMessage = typeof userMessage === 'string' ? userMessage : '';
  const cleaned = safeMessage.replace(/@(?:HiveAI|AI)\b/gi, '').trim();

  const promptText = cleaned || safeMessage.trim() || 'Hello';

  if (!hasAnyKey()) {
    return missingKeyMessage();
  }


  const senderContext = senderName ? ` You're replying to a group chat message from ${senderName}.` : '';
  const systemPrompt = `You are ${AI_BOT_NAME}, a helpful AI teammate in a group chat app.${senderContext} Be concise, friendly, and practical. Reply in the same language the user uses (English or Urdu). Use the recent conversation history (if provided) to stay on topic and avoid re-asking things already covered. Always write at least one sentence back, even for a short greeting like "hi" or "hello" — never return an empty reply.`;

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
    let reply = await callAIProvider(chatMessages, 1024);

    if (!reply || !reply.trim()) {
      reply = await callAIProvider(chatMessages, 2048);
    }

    return (reply && reply.trim()) || `Hey! 👋 I'm ${AI_BOT_NAME} — how can I help?`;
  } catch (e) {
    console.error('generateAIReply error:', e);
    return `Sorry, I ran into a problem answering that just now. Please try again in a moment 🙏${aiFailureHint(e)}`;
  }
}


function categoryHint(e) {
  const msg = String(e?.message || '').toLowerCase();

  if (/401|unauthorized|invalid.*(api.?key|credentials)|no auth credentials/.test(msg)) {
    return '\n\n_(debug: AI provider rejected the API key — check that EXPO_PUBLIC_OPENROUTER_API_KEY is set correctly for this build, e.g. via EAS environment variables, then rebuild.)_';
  }
  if (/network request failed|failed to fetch|fetch failed|cancell?ed|aborted|timed out|timeout/.test(msg)) {
    return '\n\n_(debug: the AI provider took too long or the connection dropped — check the internet connection and try again. Details: ' + String(e?.message || '').slice(0, 200) + ')_';
  }
  if (/per-day|per day|daily/.test(msg) && /429|rate.?limit|free/.test(msg)) {
    return '\n\n_(debug: OpenRouter DAILY free-model limit reached (50 requests/day on accounts that never bought credits — shared by all :free models, and failed attempts count too). It resets at 00:00 UTC (05:00 Pakistan time). To lift it to 1000/day, buy $10 of OpenRouter credits once.)_';
  }
  if (/429|rate.?limit/.test(msg)) {
    return '\n\n_(debug: AI provider rate-limited this request — the free model is temporarily overloaded, try again shortly.)_';
  }

  if (/402|payment required|insufficient.*(credit|balance|quota)|requires? (a )?payment/.test(msg)) {
    return '\n\n_(debug: OpenRouter rejected this as a payment/credits issue — free-tier `:free` models are rate-limited per key and may need a linked payment method or a wait before more requests go through. Check the OpenRouter dashboard for this key\'s usage/limits.)_';
  }
  // A model ID that's been renamed/retired/typo'd comes back as 400/404 with
  // "not a valid model id" or similar — again previously silent.
  if (/404|400|not found|no endpoints found|invalid model|not a valid model/.test(msg)) {
    return '\n\n_(debug: OpenRouter rejected the request — the configured model ID may be invalid, renamed, or retired. Double-check AI_MODEL/AI_VISION_MODEL/EMBEDDING_MODEL in src/config.js against OpenRouter\'s current model list.)_';
  }
  if (/5\d\d/.test(msg)) {
    return '\n\n_(debug: AI provider returned a server error — likely temporary on their end.)_';
  }

  const raw = String(e?.message || '').trim();
  if (raw) {
    return `\n\n_(debug: ${raw.slice(0, 200)})_`;
  }
  return '';
}


// Friendly category line + the raw provider/network message, so the on-screen
// "(debug: …)" note always says exactly what went wrong (dev builds only need
// to read the bubble instead of hunting through Metro logs).
function aiFailureHint(e) {
  // Provider names, raw errors and version stamps are for developers only —
  // real users just get the friendly sentence.
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return '';
  const category = categoryHint(e);
  const raw = String(e?.message || '').trim();
  let out;
  if (!category) {
    out = raw ? `\n\n_(debug: ${raw.slice(0, 300)})_` : '\n\n_(debug: no error message)_';
  } else if (!raw || category.includes(raw.slice(0, 40))) {
    out = category;
  } else {
    out = `${category}\n_raw: ${raw.slice(0, 300)}_`;
  }
  // Version stamp: if this is missing on screen, the phone is running an OLD bundle.
  return `${out}\n_[ai ${AI_SERVICE_VERSION}]_`;
}

function buildSources(contextChunks) {
  const byFile = new Map();
  contextChunks.forEach((c, i) => {
    if (!byFile.has(c.fileName)) {
      byFile.set(c.fileName, { fileName: c.fileName, score: c.score, refIndex: i + 1 });
    }
  });
  return Array.from(byFile.values());
}


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

  if (!hasAnyKey()) {
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
      1024
    );
    return { text: reply || 'Could not generate an answer.', sources };
  } catch (e) {
    console.error('generateRAGAnswer error:', e);
    return {
      text: `Sorry, I couldn't read through the document(s) just now. Please try again in a moment 🙏${aiFailureHint(e)}`,
      sources,
    };
  }
}


export async function analyzeImageContent(fileName, base64DataUrl, userPrompt) {
  if (!hasAnyKey()) {
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
    const models = await buildChain([AI_VISION_MODEL, ...AI_VISION_FALLBACK_MODELS], 'vision');
    const { reply, model } = await runModelChain(models, async (m) => ({
      reply: await callOpenRouter(visionMessages, 3072, m, 0, CHAIN_ATTEMPT_TIMEOUT_MS),
      model: m,
    }));
    return { text: reply?.trim() || 'Could not analyze the image.', model };
  } catch (e) {
    console.error('analyzeImageContent error:', e);
    return {
      text: `Sorry, I couldn't analyze that image just now. Please try again in a moment 🙏${aiFailureHint(e)}`,
      model: AI_VISION_MODEL,
    };
  }
}


export async function generateConversationSummary(messages) {
  const realMessages = (messages || []).filter((m) => m.text && m.text.trim());

  if (realMessages.length === 0) {
    return "There's nothing to summarize yet — send a few messages in this group first.";
  }

  const transcript = realMessages
    .map((m) => `${m.senderName || 'Someone'}: ${m.text}`)
    .join('\n')
    .slice(-6000); // keep the prompt bounded — newest messages matter most

  if (!hasAnyKey()) {
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
      1024
    );
    return reply || 'Could not generate a summary.';
  } catch (e) {
    console.error('generateConversationSummary error:', e);
    return `Sorry, I couldn't summarize this conversation just now. Please try again in a moment 🙏${aiFailureHint(e)}`;
  }
}


export async function extractActionItems(messages) {
  const realMessages = (messages || []).filter((m) => m.text && m.text.trim());

  if (realMessages.length === 0) {
    return "There's nothing to extract yet — send a few messages in this group first.";
  }

  const transcript = realMessages
    .map((m) => `${m.senderName || 'Someone'}: ${m.text}`)
    .join('\n')
    .slice(-6000);

  if (!hasAnyKey()) {
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
      1024
    );
    return reply || 'Could not extract action items.';
  } catch (e) {
    console.error('extractActionItems error:', e);
    return `Sorry, I couldn't extract action items just now. Please try again in a moment 🙏${aiFailureHint(e)}`;
  }
}