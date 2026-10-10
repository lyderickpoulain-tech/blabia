// Rapports de coût (v5.1) : coût réel par projet (UsageLog) et dépense du mois de
// l'organisation Anthropic (Admin API, clé ANTHROPIC_ADMIN_KEY).
const db = require('../utils/db');

// Réunions antérieures au suivi réel (aucune ligne UsageLog) : estimation à partir
// de Session.tokensUsed (tours de chat uniquement) au tarif du modèle de la réunion.
// projectRef : expression SQL de l'id du projet (colonne ou « ? »).
const LEGACY_COST_SQL = (projectRef) => `
  SELECT COALESCE(SUM(
    ( COALESCE(CAST(s."tokensUsed"->>'input'  AS BIGINT), 0) * CASE WHEN s."model" LIKE '%opus%' THEN 5  ELSE 3  END
    + COALESCE(CAST(s."tokensUsed"->>'output' AS BIGINT), 0) * CASE WHEN s."model" LIKE '%opus%' THEN 25 ELSE 15 END
    ) / 1000000.0), 0)
  FROM "Session" s
  WHERE s."projectId" = ${projectRef}
    AND s."tokensUsed" IS NOT NULL AND s."tokensUsed" != '{}'::jsonb
    AND NOT EXISTS (SELECT 1 FROM "UsageLog" u WHERE u."sessionId" = s."id")`;

async function projectCostReport(projectId) {
  const [totals, byKind, bySession, legacy] = await Promise.all([
    db('UsageLog').where({ projectId })
      .select(db.raw('COALESCE(SUM("costUSD"), 0) AS cost'), db.raw('MIN("createdAt") AS since'), db.raw('COUNT(*)::int AS calls'))
      .first(),
    db('UsageLog').where({ projectId }).groupBy('kind')
      .select('kind', db.raw('SUM("costUSD") AS "costUSD"'), db.raw('COUNT(*)::int AS calls'))
      .orderBy('costUSD', 'desc'),
    db('UsageLog').where({ projectId }).whereNotNull('sessionId').groupBy('sessionId')
      .select('sessionId', db.raw('SUM("costUSD") AS "costUSD"')),
    db.raw(LEGACY_COST_SQL('?'), [projectId]),
  ]);
  return {
    realCostUSD:   Number(totals?.cost) || 0,
    legacyCostUSD: Number(Object.values(legacy.rows[0] || {})[0]) || 0,
    trackedSince:  totals?.since || null,
    calls:         totals?.calls || 0,
    byKind:        byKind.map(k => ({ kind: k.kind, costUSD: Number(k.costUSD) || 0, calls: k.calls })),
    bySession:     Object.fromEntries(bySession.map(r => [r.sessionId, Number(r.costUSD) || 0])),
  };
}

// ── Dépense du mois de l'organisation (Admin API Usage & Cost) ─────────────────
// https://platform.claude.com/docs/en/manage-claude/usage-cost-api
// Montants renvoyés en cents (chaînes décimales), USD, par tranche d'un jour.
const CACHE_MS = 5 * 60 * 1000; // les données Anthropic arrivent ~5 min après les appels
let cache = { at: 0, value: null };

function monthStartUTC(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function fetchOrgMonthSpend(now = new Date()) {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) return { available: false, reason: 'missing_key' };

  const start = monthStartUTC(now);
  let totalCents = 0;
  let page = null;
  for (let i = 0; i < 5; i++) { // ≤ 31 tranches journalières : une page suffit en pratique
    const qs = new URLSearchParams({ starting_at: start.toISOString(), ending_at: now.toISOString(), bucket_width: '1d', limit: '31' });
    if (page) qs.set('page', page);
    const r = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${qs}`, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'User-Agent': 'BlabIA/5.1' },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error(`[usage] cost_report HTTP ${r.status} : ${body.slice(0, 300)}`);
      return { available: false, reason: r.status === 401 || r.status === 403 ? 'invalid_key' : 'api_error' };
    }
    const json = await r.json();
    for (const bucket of json.data || []) {
      for (const res of bucket.results || []) totalCents += Number(res.amount) || 0;
    }
    if (!json.has_more || !json.next_page) break;
    page = json.next_page;
  }
  return { available: true, orgSpendUSD: totalCents / 100, currency: 'USD' };
}

async function monthSpend({ refresh = false } = {}) {
  const now = new Date();
  const start = monthStartUTC(now);
  const blabia = await db('UsageLog').where('createdAt', '>=', start)
    .select(db.raw('COALESCE(SUM("costUSD"), 0) AS cost')).first();

  if (refresh || !cache.value || Date.now() - cache.at > CACHE_MS) {
    try {
      cache = { at: Date.now(), value: await fetchOrgMonthSpend(now) };
    } catch (err) {
      console.error('[usage] cost_report :', err.message);
      cache = { at: Date.now(), value: { available: false, reason: 'api_error' } };
    }
  }
  return {
    monthStart:  start.toISOString(),
    blabiaUSD:   Number(blabia?.cost) || 0, // calculé par BlabIA (UsageLog)
    org:         cache.value,               // facturé par Anthropic (toute l'organisation)
    fetchedAt:   new Date(cache.at).toISOString(),
  };
}

module.exports = { LEGACY_COST_SQL, projectCostReport, monthSpend, fetchOrgMonthSpend, monthStartUTC };
