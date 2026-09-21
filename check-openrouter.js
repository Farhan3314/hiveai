// HiveAI — OpenRouter health check (runs on your PC, NOT in the app).
//
//   node check-openrouter.js
//
// Needs Node 18+ (node --version). Reads EXPO_PUBLIC_OPENROUTER_API_KEY from
// .env in this folder. It never prints the key.
//
// It answers ONE question: "is the problem OpenRouter (key / quota / model),
// or is it the app?"

const fs = require('fs');
const path = require('path');

function readEnvFile() {
  const envPath = path.join(__dirname, '.env');
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...readEnvFile(), ...process.env };
const KEY = (env.EXPO_PUBLIC_OPENROUTER_API_KEY || '').trim();
const MODELS = [
  env.EXPO_PUBLIC_AI_MODEL || 'nvidia/nemotron-3.5-lightning:free',
  env.EXPO_PUBLIC_AI_FALLBACK_MODEL || 'qwen/qwen3.8-27b:free',
];

const line = (s = '') => console.log(s);

async function call(url, options = {}, timeoutMs = 60000) {
  const started = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { res, text, json, ms: Date.now() - started };
  } catch (e) {
    return { error: e, ms: Date.now() - started };
  }
}

(async () => {
  line('=== HiveAI OpenRouter check ===');
  line(`Node ${process.version}`);

  if (typeof fetch !== 'function') {
    line('FAIL: this Node has no fetch(). Install Node 18 or newer.');
    process.exit(1);
  }

  // ---- 1. key present? --------------------------------------------------
  if (!KEY) {
    line('FAIL: EXPO_PUBLIC_OPENROUTER_API_KEY not found in .env');
    line('      .env must contain exactly one line like:');
    line('      EXPO_PUBLIC_OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx   (no spaces, no quotes)');
    process.exit(1);
  }
  line(`Key found in .env: starts with "${KEY.slice(0, 9)}...", length ${KEY.length}`);
  if (!KEY.startsWith('sk-or-')) line('WARNING: an OpenRouter key normally starts with "sk-or-". Wrong key pasted?');
  line();

  // ---- 2. key info + free-model quota ------------------------------------
  line('--- 1) Key & quota (GET /api/v1/key) ---');
  const k = await call('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${KEY}` } });
  if (k.error) {
    line(`FAIL: could not reach openrouter.ai from this PC: ${k.error.message}`);
    line('      -> internet / firewall / VPN problem on the PC.');
  } else if (k.res.status === 401) {
    line('FAIL 401: OpenRouter does not accept this key (deleted / rotated / typo).');
    line('      -> create a new key at https://openrouter.ai/keys and put it in .env');
  } else {
    const d = k.json?.data || {};
    line(`HTTP ${k.res.status} in ${k.ms} ms`);
    for (const f of ['is_free_tier', 'usage_daily', 'usage', 'limit', 'limit_remaining', 'free_model_daily_requests']) {
      if (d[f] !== undefined) line(`  ${f}: ${JSON.stringify(d[f])}`);
    }
    const q = d.free_model_daily_requests;
    if (q && typeof q === 'object') {
      const remaining = q.remaining ?? (q.limit != null && q.used != null ? q.limit - q.used : undefined);
      if (remaining === 0) line('  >>> DAILY FREE QUOTA IS USED UP. Every :free model will answer 429 until 00:00 UTC.');
    }
  }
  line();

  // ---- 3. each model -----------------------------------------------------
  let anyOk = false;
  let sawDaily = false;
  for (const model of MODELS) {
    line(`--- 2) Model: ${model} ---`);
    const r = await call('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
        'HTTP-Referer': 'https://hiveai.app',
        'X-Title': 'HiveAI check',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
        provider: { allow_fallbacks: true },
      }),
    });

    if (r.error) {
      line(`FAIL after ${r.ms} ms: ${r.error.name}: ${r.error.message}`);
      line(r.error.name === 'TimeoutError' ? '      -> model did not answer within 60s (overloaded).' : '      -> network problem.');
      line();
      continue;
    }

    line(`HTTP ${r.res.status} in ${r.ms} ms (${(r.ms / 1000).toFixed(1)} s)`);
    const errMsg = r.json?.error?.message;
    if (!r.res.ok || r.json?.error) {
      line(`ERROR: ${errMsg || r.text.slice(0, 300)}`);
      if (/per-day|per day|daily/i.test(`${errMsg}`)) {
        sawDaily = true;
        line('      -> DAILY FREE LIMIT reached (50/day if you never bought credits).');
      } else if (r.res.status === 429) {
        line('      -> rate limited / model busy right now (20 per minute max, or provider congestion).');
      } else if (r.res.status === 401) {
        line('      -> key rejected.');
      } else if (r.res.status === 402) {
        line('      -> credits problem (negative balance).');
      } else if (r.res.status === 404 || r.res.status === 400) {
        line('      -> model id wrong / retired / no provider available.');
      }
      line();
      continue;
    }

    const choice = r.json?.choices?.[0];
    const content = choice?.message?.content;
    const reasoning = choice?.message?.reasoning;
    line(`finish_reason: ${choice?.finish_reason}`);
    if (typeof content === 'string' && content.trim()) {
      anyOk = true;
      line(`OK  reply: "${content.trim().slice(0, 100)}"`);
    } else {
      line('WARNING: HTTP 200 but the answer text (content) is EMPTY.');
      if (reasoning) line('         The model only produced "reasoning" and ran out of tokens.');
    }
    line();
  }

  // ---- 4. verdict --------------------------------------------------------
  line('=== VERDICT ===');
  if (anyOk) {
    line('OpenRouter, the key and at least one model WORK from this PC.');
    line('=> The problem is inside the app / phone (old bundle, wrong .env, or the phone\'s internet).');
    line('=> Continue with STEP 3 of the guide.');
  } else if (sawDaily) {
    line('Daily free-model quota is used up. Wait for 00:00 UTC (05:00 Pakistan time)');
    line('or buy $10 of credits once at https://openrouter.ai/settings/credits (raises it to 1000/day).');
  } else {
    line('No model answered. Read the ERROR lines above — they say why (401 key / 429 limit / 404 model / network).');
  }
})();