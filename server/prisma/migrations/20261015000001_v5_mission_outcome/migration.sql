-- v5.1 (15/10/2026) : rapport de mission examiné par l'humain — « Intégrer le CR au projet »
-- (document actif + mémoire des agents, action cochée) ou « Ne pas intégrer » (document retiré).
-- NULL = rapport prêt, en attente de son choix. Les missions déjà terminées avaient été
-- intégrées automatiquement : elles sont marquées « integrated ».
ALTER TABLE "AgentMission" ADD COLUMN IF NOT EXISTS "outcome" TEXT;
UPDATE "AgentMission" SET "outcome" = 'integrated' WHERE status = 'done' AND "outcome" IS NULL;
