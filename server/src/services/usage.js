// Coût réel de l'IA (v5.1) : chaque appel à l'API Anthropic est journalisé dans
// UsageLog avec l'usage exact renvoyé par l'API et son coût (services/pricing.js).
//
// Le rattachement au projet / à la réunion se fait sans toucher aux appelants :
// usageMiddleware ouvre un contexte (AsyncLocalStorage) pour chaque requête HTTP,
// et services/anthropic.js journalise toute réponse de messages.create() dans ce
// contexte — y compris les appels qui se terminent après l'envoi de la réponse HTTP.
const { AsyncLocalStorage } = require('async_hooks');
const db = require('../utils/db');
const { normalizeUsage, costUSD } = require('./pricing');

const store = new AsyncLocalStorage();

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PROJECT_URL = new RegExp(`^/api/projects/(${UUID})(?:/sessions/(${UUID}))?(?:/(.*))?$`, 'i');

// Déduit projet, réunion et type d'appel de l'URL (ex. /api/projects/:id/sessions/:sid/chat → chat)
function parseUsageTarget(url, body) {
  const path = url.split('?')[0];
  const m = path.match(PROJECT_URL);
  if (m) {
    return { projectId: m[1], sessionId: m[2] || null, kind: (m[3] || 'project').replace(/\/$/, '') || 'project' };
  }
  // Routes hors /projects/:id (ex. /api/export/claude-code) : projet transmis dans le corps
  const kind = path.replace(/^\/api\//, '') || 'other';
  const projectId = typeof body?.projectId === 'string' && new RegExp(`^${UUID}$`, 'i').test(body.projectId) ? body.projectId : null;
  return { projectId, sessionId: null, kind };
}

// Monté après express.json() : le corps est disponible
function usageMiddleware(req, _res, next) {
  if (!req.originalUrl.startsWith('/api/')) return next();
  // req est conservé : req.user n'est posé que plus tard par le middleware d'authentification
  store.run({ req, ...parseUsageTarget(req.originalUrl, req.body) }, next);
}

// Hors requête HTTP (scripts) : contexte explicite
function runWithUsage(ctx, fn) {
  return store.run(ctx, fn);
}

async function recordUsage(model, usage) {
  if (!usage) return;
  const ctx = store.getStore() || {};
  const u = normalizeUsage(usage);
  try {
    await db('UsageLog').insert({
      userId:           ctx.req?.user?.id || ctx.userId || null,
      projectId:        ctx.projectId || null,
      sessionId:        ctx.sessionId || null,
      kind:             String(ctx.kind || 'other').slice(0, 80),
      model:            model || 'inconnu',
      inputTokens:      u.inputTokens,
      outputTokens:     u.outputTokens,
      cacheWriteTokens: u.cacheWrite5m + u.cacheWrite1h,
      cacheReadTokens:  u.cacheReadTokens,
      webSearches:      u.webSearches,
      costUSD:          costUSD(model, usage),
    });
  } catch (err) {
    // Projet/réunion supprimé entre-temps (clé étrangère) : on garde le coût sans rattachement
    if (err.code === '23503' && (ctx.projectId || ctx.sessionId)) {
      return store.run({ ...ctx, projectId: null, sessionId: null }, () => recordUsage(model, usage));
    }
    console.error('[usage] journalisation impossible :', err.message);
  }
}

// Routes qui sollicitent l'IA (UsageLog.kind) : refusées sur un projet exemple
const AI_KINDS = [
  'chat', 'extract-file', 'generate-deliverable', 'generate-memory', 'sessions/suggest-agents',
  'quick-command', 'generate-timeline', 'tools/analyze', 'export/claude-code',
];

// Monté après usageMiddleware. Projet exemple (visite guidée) : jeu de données
// fixe, l'IA n'est jamais appelée — donc aucun coût, et pas de contenu altéré.
async function demoGuard(req, res, next) {
  if (req.method !== 'POST') return next();
  const ctx = store.getStore();
  if (!ctx?.projectId || !AI_KINDS.includes(ctx.kind)) return next();
  try {
    const [p] = await db('Project').where({ id: ctx.projectId }).select('isDemo').limit(1);
    if (p?.isDemo) {
      return res.status(403).json({ demo: true, error: 'Projet exemple : les agents ne sont pas sollicités pendant la visite guidée. Créez votre propre projet pour les faire travailler.' });
    }
  } catch (err) {
    console.error('[demoGuard]', err.message);
  }
  next();
}

module.exports = { usageMiddleware, demoGuard, runWithUsage, recordUsage, parseUsageTarget, AI_KINDS };
