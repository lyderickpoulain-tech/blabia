// Rapports de coût (v5.1) : coût réel par projet (UsageLog).
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
      .select(db.raw('COALESCE(SUM("costUSD"), 0) AS cost'), db.raw('MIN("createdAt") AS since'), db.raw('COUNT(*)::int AS calls'),
        db.raw(`COALESCE(SUM("costUSD") FILTER (WHERE "billedTo" = 'user'), 0) AS "userKeyCost"`))
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
    userKeyCostUSD: Number(totals?.userKeyCost) || 0, // v5.1 : payé sur la clé API du porteur
    byKind:        byKind.map(k => ({ kind: k.kind, costUSD: Number(k.costUSD) || 0, calls: k.calls })),
    bySession:     Object.fromEntries(bySession.map(r => [r.sessionId, Number(r.costUSD) || 0])),
  };
}

module.exports = { LEGACY_COST_SQL, projectCostReport };
