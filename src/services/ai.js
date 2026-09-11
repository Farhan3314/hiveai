import { OPENAI_API_KEY, AI_BOT_NAME, OPENROUTER_API_KEY } from '../config';

const DEMO_REPLIES = [
  "I'm here to help! Please describe your question in detail and mention @HiveAI.",
  "Great question! Based on the group context, I suggest breaking this into smaller tasks.",
  "Here's a quick summary: focus on API integration first, then UI polish.",
];

const OPENROUTER_MODEL = 'nvidia/nemotron-3.5-lightning:free';
// Text-only free model above can't see images. This one can (image + text
// input, OpenAI-compatible content format), so it's used as the fallback
// for photo analysis whenever OPENAI_API_KEY isn't configured/working.
const OPENROUTER_VISION_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free';

async function callOpenAI(messages, maxTokens) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function callOpenRouter(messages, maxTokens, model = OPENROUTER_MODEL) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

// Calls whichever real AI provider is configured. Tries OpenAI first when a
// key is set, but — unlike before — a failed OpenAI call (expired key, no
// billing credits, rate limit, etc.) now falls through to OpenRouter instead
// of failing the whole request outright, as long as an OpenRouter key is
// also configured. Returns null if no provider is configured at all, so
// callers can fall back to demo mode.
async function callAIProvider(messages, maxTokens) {
  if (OPENAI_API_KEY) {
    try {
      return await callOpenAI(messages, maxTokens);
    } catch (e) {
      if (!OPENROUTER_API_KEY) throw e;
      console.warn('OpenAI call failed, falling back to OpenRouter:', e.message);
    }
  }

  if (OPENROUTER_API_KEY) {
    return await callOpenRouter(messages, maxTokens);
  }

  return null;
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

  if (!OPENAI_API_KEY && !OPENROUTER_API_KEY) {
    return `[Demo mode] ${AI_BOT_NAME}: ${DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)]}\n\n(Aapka message: "${promptText.slice(0, 120)}")`;
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
    let reply = await callAIProvider(chatMessages, 400);

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
    return `Sorry, I ran into a problem answering that just now. Please try again in a moment 🙏`;
  }
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

  if (!OPENAI_API_KEY && !OPENROUTER_API_KEY) {
    return {
      text: `[Demo mode] ${AI_BOT_NAME}: Found ${contextChunks.length} relevant passage(s) in your document(s), but need EXPO_PUBLIC_OPENROUTER_API_KEY to actually answer. Top match:\n\n"${contextChunks[0].text.slice(0, 200)}..."`,
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


export async function analyzeImageContent(fileName, base64DataUrl, userPrompt) {
  if (!OPENAI_API_KEY && !OPENROUTER_API_KEY) {
    return `[Demo mode] ${AI_BOT_NAME}: Photo "${fileName}" received. Add EXPO_PUBLIC_OPENAI_API_KEY or EXPO_PUBLIC_OPENROUTER_API_KEY for real analysis.`;
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

  // Try OpenAI's vision model first when configured, exactly like the
  // text path does — but unlike before, a missing/failed OpenAI key no
  // longer means "sorry, can't see images". It now falls through to a
  // free vision-capable model on OpenRouter instead.
  if (OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 400, messages: visionMessages }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI API error ${res.status}`);
      }
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) return reply;
    } catch (e) {
      if (!OPENROUTER_API_KEY) {
        console.error('analyzeImageContent (OpenAI) error:', e);
        return `Sorry, I couldn't analyze that image just now. Please try again in a moment 🙏`;
      }
      console.warn('analyzeImageContent: OpenAI call failed, falling back to OpenRouter vision model:', e.message);
    }
  }

  if (!OPENROUTER_API_KEY) {
    return `Sorry, I couldn't analyze that image just now. Please try again in a moment 🙏`;
  }

  try {
    const reply = await callOpenRouter(visionMessages, 400, OPENROUTER_VISION_MODEL);
    return reply?.trim() || 'Could not analyze the image.';
  } catch (e) {
    console.error('analyzeImageContent (OpenRouter) error:', e);
    return `Sorry, I couldn't analyze that image just now. Please try again in a moment 🙏`;
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

  if (!OPENAI_API_KEY && !OPENROUTER_API_KEY) {
    return `[Demo mode] ${AI_BOT_NAME}: Found ${realMessages.length} messages in this conversation. Add EXPO_PUBLIC_OPENAI_API_KEY or EXPO_PUBLIC_OPENROUTER_API_KEY for a real AI-generated summary.\n\nMost recent message: "${realMessages[realMessages.length - 1].text.slice(0, 150)}"`;
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

  if (!OPENAI_API_KEY && !OPENROUTER_API_KEY) {
    return `[Demo mode] ${AI_BOT_NAME}: Scanned ${realMessages.length} messages. Add EXPO_PUBLIC_OPENAI_API_KEY or EXPO_PUBLIC_OPENROUTER_API_KEY for real AI-extracted action items.`;
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

export async function analyzeFileContent(fileName, textContent) {
  if (!OPENAI_API_KEY && !OPENROUTER_API_KEY) {
    return `[Demo Analysis of "${fileName}"]\n\nFile received (${textContent?.length || 0} chars). Add EXPO_PUBLIC_OPENAI_API_KEY or EXPO_PUBLIC_OPENROUTER_API_KEY for real analysis.\n\nPreview: ${(textContent || '').slice(0, 200)}`;
  }

  try {
    const reply = await callAIProvider(
      [
        {
          role: 'system',
          content: 'Analyze the uploaded file content. Provide: 1) Brief summary 2) Key points 3) Suggested actions.',
        },
        { role: 'user', content: `File: ${fileName}\n\n${textContent?.slice(0, 3000) || '(binary file)'}` },
      ],
      400
    );
    return reply || 'Analysis complete.';
  } catch (e) {
    console.error('analyzeFileContent error:', e);
    return `Sorry, I couldn't analyze that file just now. Please try again in a moment 🙏`;
  }
}