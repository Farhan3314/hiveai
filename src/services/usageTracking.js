import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// Rough token estimate: ~4 characters per token (a common OpenAI-style
// approximation). No tokenizer dependency needed for usage/cost visibility.
export function estimateTokens(text = '') {
  const len = (text || '').toString().length;
  return Math.max(1, Math.ceil(len / 4));
}

// $ per 1,000 tokens. Free/demo models cost 0 — real paid models can be
// added here as they're wired up in services/ai.js.
const MODEL_PRICING = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'nvidia/nemotron-3.5-lightning:free': { input: 0, output: 0 },
  'nvidia/nemotron-3-embed-1b:free': { input: 0, output: 0 },
  demo: { input: 0, output: 0 },
};

export function estimateCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model] || { input: 0, output: 0 };
  const cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
  return Math.round(cost * 1e6) / 1e6;
}

// Logs one AI call for cost/usage analytics (README Phase 3: "AI Cost &
// Analytics"). This is additive/best-effort — a logging failure must never
// break the actual AI reply flow, so every error is swallowed here.
export async function logAIUsage({
  userId,
  groupId,
  chatId,
  category, // 'group_mention' | 'ai_assistant' | 'summary' | 'file_analysis' | 'action_items' | 'image_analysis'
  model,
  inputText,
  outputText,
  subscriptionPlan,
}) {
  try {
    const inputTokens = estimateTokens(inputText);
    const outputTokens = estimateTokens(outputText);
    const totalTokens = inputTokens + outputTokens;
    const estimatedCost = estimateCost(model, inputTokens, outputTokens);

    await addDoc(collection(db, 'aiUsageLogs'), {
      userId: userId || null,
      groupId: groupId || null,
      chatId: chatId || null,
      category: category || 'other',
      subscriptionPlan: subscriptionPlan || 'free',
      model: model || 'unknown',
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost,
      createdAt: serverTimestamp(),
    });

    return { inputTokens, outputTokens, totalTokens, estimatedCost };
  } catch (e) {
    console.warn('logAIUsage failed (non-fatal):', e.message);
    return null;
  }
}

const CATEGORY_LABELS = {
  group_mention: { label: 'Chat @HiveAI mentions', icon: 'chatbubble' },
  ai_assistant: { label: 'AI Assistant tab', icon: 'sparkles' },
  summary: { label: 'Conversation summaries', icon: 'document-text' },
  action_items: { label: 'Action item extraction', icon: 'checkbox' },
  file_analysis: { label: 'File analysis', icon: 'document' },
  image_analysis: { label: 'Image analysis', icon: 'image' },
  other: { label: 'Other', icon: 'ellipsis-horizontal' },
};

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || CATEGORY_LABELS.other;
}

// Returns this user's usage totals broken down by category, for
// AIUsageScreen. Filtering to "this calendar month" happens client-side
// (avoids needing a composite Firestore index for a demo-scale collection).
export async function getUsageBreakdown(userId) {
  const empty = { breakdown: {}, totalTokens: 0, totalCost: 0, totalCalls: 0 };
  if (!userId) return empty;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    const q = query(collection(db, 'aiUsageLogs'), where('userId', '==', userId));
    const snap = await getDocs(q);

    const breakdown = {};
    let totalTokens = 0;
    let totalCost = 0;
    let totalCalls = 0;

    snap.docs.forEach((d) => {
      const data = d.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
      if (createdAt && createdAt < startOfMonth) return;

      const cat = data.category || 'other';
      if (!breakdown[cat]) breakdown[cat] = { calls: 0, tokens: 0, cost: 0 };
      breakdown[cat].calls += 1;
      breakdown[cat].tokens += data.totalTokens || 0;
      breakdown[cat].cost += data.estimatedCost || 0;

      totalTokens += data.totalTokens || 0;
      totalCost += data.estimatedCost || 0;
      totalCalls += 1;
    });

    return { breakdown, totalTokens, totalCost, totalCalls };
  } catch (e) {
    console.warn('getUsageBreakdown failed:', e.message);
    return empty;
  }
}
