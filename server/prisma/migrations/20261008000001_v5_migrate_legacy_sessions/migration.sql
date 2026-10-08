-- v5.0 Phase 1 : bascule des sessions legacy (mode 'realtime' | 'conversation')
-- vers le format v3 (messages / activeAgents) pour rester consultables en
-- lecture seule dans MeetingRoom après suppression du pipeline legacy.
--
-- Défensif : ne touche que les sessions dont "messages" est encore vide,
-- pour ne jamais écraser ou dupliquer une conversation déjà au format v3.
-- "exchanges" et "agents" ne sont jamais supprimés (règle v5.0 : pas de DROP).
--
-- Types d'éléments rencontrés dans "exchanges" (format legacy) :
--   plan    { content, createdAt }                     — plan de formation d'équipe
--   human   { agent:'Utilisateur', content, createdAt } — message humain
--   agent   { agent:<nom>, content, createdAt }         — message d'agent
--   summary { content, createdAt }                      — restitution d'un tour

UPDATE "Session" s
SET
  "messages" = (
    SELECT jsonb_agg(
      CASE e->>'type'
        WHEN 'plan' THEN jsonb_build_object(
          'id', gen_random_uuid()::text, 'role', 'system', 'agentName', NULL,
          'content', '🧭 ' || coalesce(e->>'content', ''),
          'timestamp', coalesce(e->>'createdAt', s."createdAt"::text),
          'type', 'message', 'pinned', false
        )
        WHEN 'human' THEN jsonb_build_object(
          'id', gen_random_uuid()::text, 'role', 'human', 'agentName', NULL,
          'content', coalesce(e->>'content', ''),
          'timestamp', coalesce(e->>'createdAt', s."createdAt"::text),
          'type', 'message', 'pinned', false
        )
        WHEN 'agent' THEN jsonb_build_object(
          'id', gen_random_uuid()::text, 'role', 'agent', 'agentName', e->>'agent',
          'content', coalesce(e->>'content', ''),
          'timestamp', coalesce(e->>'createdAt', s."createdAt"::text),
          'type', 'message', 'pinned', false
        )
        WHEN 'summary' THEN jsonb_build_object(
          'id', gen_random_uuid()::text, 'role', 'system', 'agentName', NULL,
          'content', '📝 Synthèse — ' || coalesce(e->>'content', ''),
          'timestamp', coalesce(e->>'createdAt', s."createdAt"::text),
          'type', 'message', 'pinned', false
        )
        ELSE jsonb_build_object(
          'id', gen_random_uuid()::text, 'role', 'system', 'agentName', NULL,
          'content', coalesce(e->>'content', ''),
          'timestamp', coalesce(e->>'createdAt', s."createdAt"::text),
          'type', 'message', 'pinned', false
        )
      END
      ORDER BY (e->>'createdAt')
    )
    FROM jsonb_array_elements(s."exchanges") AS e
  ),
  "activeAgents" = s."agents",
  "mode"   = 'meeting',
  "status" = CASE WHEN s."status" = 'open' THEN 'abandoned' ELSE s."status" END
WHERE s."mode" != 'meeting'
  AND (s."messages" IS NULL OR s."messages" = '[]'::jsonb)
  AND jsonb_typeof(s."exchanges") = 'array'
  AND jsonb_array_length(s."exchanges") > 0;
