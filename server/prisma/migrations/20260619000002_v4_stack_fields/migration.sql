-- Évolution 4 (v4.0) : champs stack technique et recherche web

-- User : boîte à outils personnelle (JSONB)
ALTER TABLE "User" ADD COLUMN "toolbox" JSONB DEFAULT '{}';

-- Project : flag projet technique
ALTER TABLE "Project" ADD COLUMN "hasTechnicalStack" BOOLEAN DEFAULT false;

-- Session : suggestions d'outils détectées pendant les réunions
ALTER TABLE "Session" ADD COLUMN "pendingToolSuggestions" JSONB DEFAULT '[]';

-- Session : activation de la recherche web par réunion (Évolution 6)
ALTER TABLE "Session" ADD COLUMN "webSearchEnabled" BOOLEAN DEFAULT false;
