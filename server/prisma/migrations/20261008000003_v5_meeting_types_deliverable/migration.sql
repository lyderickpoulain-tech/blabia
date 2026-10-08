-- v5.0 Phase 3.2 : consolidation des types d'objectif (decision | claude_code | stack)
-- + séparation compte-rendu / livrable + renommage pendingStepSuggestions

-- Nouvelles colonnes (additives, cf. schema.prisma)
ALTER TABLE "Session" ADD COLUMN "deliverable" TEXT;
ALTER TABLE "Session" ADD COLUMN "pendingMeetingSuggestions" JSONB DEFAULT '[]';

-- ── Milestone.type : stack_check -> stack, claude_code inchangé, tout le reste -> decision
UPDATE "Milestone" SET type = 'stack' WHERE type = 'stack_check';
UPDATE "Milestone" SET type = 'decision' WHERE type NOT IN ('stack', 'claude_code', 'decision');

-- ── Session.intention (tableau JSON, un seul élément en pratique) : même mapping
UPDATE "Session" s
SET intention = (
  SELECT jsonb_agg(
    CASE WHEN elem #>> '{}' = 'claude_code' THEN 'claude_code' ELSE 'decision' END
  )
  FROM jsonb_array_elements(s.intention) AS elem
)
WHERE s.intention IS NOT NULL
  AND jsonb_typeof(s.intention) = 'array'
  AND jsonb_array_length(s.intention) > 0;

-- ── Session.deliverable : pour les sessions claude_code déjà conclues, le prompt
-- était stocké dans "summary" (hasCode=true le signale sans ambiguïté). On le
-- déplace vers "deliverable" et on vide "summary" (désormais = compte-rendu uniquement).
UPDATE "Session"
SET deliverable = summary, summary = NULL
WHERE "hasCode" = true AND summary IS NOT NULL AND deliverable IS NULL;

-- ── pendingMeetingSuggestions : copie depuis pendingStepSuggestions (ancien format
-- { title, type, agentName, timestamp } -> nouveau format avec id/objective/reason/after/status).
-- Défensif : ne touche que les sessions où pendingMeetingSuggestions est encore vide.
UPDATE "Session" s
SET "pendingMeetingSuggestions" = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'title', elem->>'title',
      'objective', '',
      'type', 'decision',
      'reason', '',
      'after', NULL,
      'status', 'pending',
      'agentName', elem->>'agentName',
      'timestamp', elem->>'timestamp'
    )
  )
  FROM jsonb_array_elements(s."pendingStepSuggestions") AS elem
)
WHERE s."pendingStepSuggestions" IS NOT NULL
  AND jsonb_typeof(s."pendingStepSuggestions") = 'array'
  AND jsonb_array_length(s."pendingStepSuggestions") > 0
  AND (s."pendingMeetingSuggestions" IS NULL OR s."pendingMeetingSuggestions" = '[]'::jsonb);
