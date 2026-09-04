import { OPENAI_API_KEY, AI_BOT_NAME, OPENROUTER_API_KEY } from '../config';

const DEMO_REPLIES = [
  "I'm here to help! Please describe your question in detail and mention @HiveAI.",
  "Great question! Based on the group context, I suggest breaking this into smaller tasks.",
  "Here's a quick summary: focus on API integration first, then UI polish.",
];

const OPENROUTER_MODEL = 'nvidia/nemotron-3.5-lightning:free';

// Calls whichever real AI provider is configured (OpenAI first, then OpenRouter).
// Returns null if neither key is set, so callers can fall back to demo mode.
async function callAIProvider(messages, maxTokens) {
  if (OPENAI_API_KEY) {
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

  if (OPENROUTER_API_KEY) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://hiveai.app',
        'X-Title': 'HiveAI',
      },
      body: JSON.stringify({ model: OPENROUTER_MODEL, messages, max_tokens: maxTokens }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenRouter API error ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  }

  return null;
}

export async function generateAIReply(userMessage) {
  const cleaned = userMessage.replace(/@(?:HiveAI|AI)\b/gi, '').trim();
  // Guard against an empty prompt (e.g. someone sends just "@HiveAI" with
  // nothing else) — sending an empty user turn to the API is what used to
  // come back with no content at all, which then showed up in the chat as
  // "Sorry, I could not generate a reply."
  const promptText = cleaned || userMessage.trim() || 'Hello';

  if (!OPENAI_API_KEY && !OPENROUTER_API_KEY) {
    return `[Demo mode] ${AI_BOT_NAME}: ${DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)]}\n\n(Aapka message: "${promptText.slice(0, 120)}")`;
  }

  const systemPrompt = `You are ${AI_BOT_NAME}, a helpful AI teammate in a group chat app. Be concise, friendly, and practical. Reply in the same language the user uses (English or Urdu). Always write at least one sentence back, even for a short greeting like "hi" or "hello" — never return an empty reply.`;

  try {
    let reply = await callAIProvider(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptText },
      ],
      400
    );

    // Some free/short-context models occasionally return an empty
    // completion for very short prompts (a plain "hi"). Rather than show
    // the user a dead-end error, retry once with a slightly larger token
    // budget before giving up.
    if (!reply || !reply.trim()) {
      reply = await callAIProvider(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptText },
        ],
        600
      );
    }

    return (reply && reply.trim()) || `Hey! 👋 I'm ${AI_BOT_NAME} — how can I help?`;
  } catch (e) {
    console.error('generateAIReply error:', e);
    return `${AI_BOT_NAME}: (${e.message}). Demo reply: ${DEMO_REPLIES[0]}`;
  }
}

// RAG answer: contextChunks is an array of { text, fileName, score } from
// services/rag.js retrieveContext(). Answers strictly from the provided
// context and says so plainly when the context doesn't cover the question,
// instead of letting the model quietly fall back to general knowledge.
export async function generateRAGAnswer(question, contextChunks) {
  if (!contextChunks || contextChunks.length === 0) {
    return "I couldn't find anything relevant to that in the uploaded document(s). Try rephrasing, or upload a document that covers this topic.";
  }

  const contextBlock = contextChunks
    .map((c, i) => `[${i + 1}] (from ${c.fileName})\n${c.text}`)
    .join('\n\n');

  if (!OPENAI_API_KEY && !OPENROUTER_API_KEY) {
    return `[Demo mode] ${AI_BOT_NAME}: Found ${contextChunks.length} relevant passage(s) in your document(s), but need EXPO_PUBLIC_OPENROUTER_API_KEY to actually answer. Top match:\n\n"${contextChunks[0].text.slice(0, 200)}..."`;
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
    return reply || 'Could not generate an answer.';
  } catch (e) {
    console.error('generateRAGAnswer error:', e);
    return `${AI_BOT_NAME}: (${e.message})`;
  }
}

// Analyzes an uploaded photo. Only OpenAI's vision-capable model can actually
// "see" the image; the free OpenRouter/Nemotron model is text-only, so we
// fall back to an honest message instead of pretending to describe it.
export async function analyzeImageContent(fileName, base64DataUrl) {
  if (!OPENAI_API_KEY && !OPENROUTER_API_KEY) {
    return `[Demo mode] ${AI_BOT_NAME}: Photo "${fileName}" received. Add EXPO_PUBLIC_OPENAI_API_KEY or EXPO_PUBLIC_OPENROUTER_API_KEY for real analysis.`;
  }

  if (!OPENAI_API_KEY) {
    return `${AI_BOT_NAME}: Got your photo "${fileName}"! The current AI model (${OPENROUTER_MODEL}) can only read text, so it can't see the image itself yet — tell me what's in it or what you'd like help with, and I'll take it from there.`;
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content: `You are ${AI_BOT_NAME}, a helpful AI teammate. Describe and analyze the image the user shared. Be concise and practical.`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Please analyze this image (file name: ${fileName}).` },
              { type: 'image_url', image_url: { url: base64DataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API error ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || 'Could not analyze the image.';
  } catch (e) {
    console.error('analyzeImageContent error:', e);
    return `${AI_BOT_NAME}: Could not analyze the image (${e.message}).`;
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
    return `${AI_BOT_NAME}: (${e.message})`;
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
    return `Analysis error: ${e.message}`;
  }
}