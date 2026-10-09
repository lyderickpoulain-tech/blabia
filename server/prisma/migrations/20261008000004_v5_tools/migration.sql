-- v5.0 phase 4 : outils (refonte de la « stack »)
-- Colonnes additives uniquement. NULL = pas encore migré : la conversion des
-- anciennes données (User.techStack/toolbox, Project.techStack, Session.pendingToolSuggestions)
-- est faite en JS à la première lecture (server/src/services/tools/toolsStore.js),
-- car elle s'appuie sur le catalogue d'outils pour reconnaître les noms.
ALTER TABLE "User" ADD COLUMN "tools" JSONB;
ALTER TABLE "Project" ADD COLUMN "tools" JSONB;
