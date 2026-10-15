-- v5.1 (16/10/2026) : réunion tenue par le bras droit à la place de l'humain — cadre, statut, note de retour
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "delegation" JSONB;
