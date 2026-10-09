-- v5.0 phase 4 (retour utilisateur) : besoins en outils du projet, analysés par BlabIA
-- [{ category, need, fit: ok|unsuited|none, warning, examples }] — NULL = jamais analysé.
ALTER TABLE "Project" ADD COLUMN "toolNeeds" JSONB;
