// Tarifs de l'API Anthropic, en USD par million de tokens.
// Source : https://platform.claude.com/docs/en/about-claude/pricing (relevé du 2026-10-10).
// À METTRE À JOUR si Anthropic change ses prix ou si un nouveau modèle est utilisé :
// un modèle absent est facturé au tarif de sa famille (opus / sonnet / haiku), avec un
// avertissement dans les logs.
const PRICES = {
  'claude-sonnet-4-6': { input: 3, cacheWrite5m: 3.75, cacheWrite1h: 6,  cacheRead: 0.30, output: 15 },
  'claude-opus-4-8':   { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.50, output: 25 },
  // Tarif des prompts ≤ 100 000 tokens (au-delà : x5) — l'orchestrateur en reste très loin
  'claude-haiku-5-5':  { input: 0.10, cacheWrite5m: 0.125, cacheWrite1h: 0.20, cacheRead: 0.01, output: 0.50 },
};
const FAMILY_FALLBACK = {
  opus:   PRICES['claude-opus-4-8'],
  sonnet: PRICES['claude-sonnet-4-6'],
  haiku:  { input: 1, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.10, output: 5 },
};
const WEB_SEARCH_USD = 10 / 1000; // 10 $ pour 1 000 recherches

const warned = new Set();
function pricesFor(model = '') {
  // L'API renvoie parfois un identifiant daté (ex. claude-sonnet-4-6-20260101)
  const key = Object.keys(PRICES).find(k => model === k || model.startsWith(`${k}-`));
  if (key) return PRICES[key];
  const family = ['opus', 'haiku', 'sonnet'].find(f => model.includes(f)) || 'sonnet';
  if (!warned.has(model)) {
    warned.add(model);
    console.warn(`[pricing] tarif inconnu pour « ${model} » : tarif ${family} appliqué (services/pricing.js)`);
  }
  return FAMILY_FALLBACK[family];
}

// Normalise l'objet usage de l'API (Message.usage) en compteurs simples
function normalizeUsage(usage = {}) {
  const cc = usage.cache_creation || {};
  const write1h = cc.ephemeral_1h_input_tokens || 0;
  // Sans détail, les écritures de cache sont comptées au tarif 5 minutes (le défaut)
  const write5m = cc.ephemeral_5m_input_tokens ?? Math.max((usage.cache_creation_input_tokens || 0) - write1h, 0);
  return {
    inputTokens:      usage.input_tokens  || 0,
    outputTokens:     usage.output_tokens || 0,
    cacheWrite5m:     write5m,
    cacheWrite1h:     write1h,
    cacheReadTokens:  usage.cache_read_input_tokens || 0,
    webSearches:      usage.server_tool_use?.web_search_requests || 0,
  };
}

function costUSD(model, usage) {
  const p = pricesFor(model);
  const u = normalizeUsage(usage);
  return (
    u.inputTokens     * p.input +
    u.cacheWrite5m    * p.cacheWrite5m +
    u.cacheWrite1h    * p.cacheWrite1h +
    u.cacheReadTokens * p.cacheRead +
    u.outputTokens    * p.output
  ) / 1_000_000 + u.webSearches * WEB_SEARCH_USD;
}

module.exports = { PRICES, pricesFor, normalizeUsage, costUSD, WEB_SEARCH_USD };
