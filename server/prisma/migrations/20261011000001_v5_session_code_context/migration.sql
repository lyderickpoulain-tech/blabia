-- v5.1 : contexte de code d'une réunion Claude Code (arborescence du dépôt, consignes,
-- fichiers utiles à l'objectif), calculé une fois au premier tour (services/codeContext.js)
ALTER TABLE "Session" ADD COLUMN "codeContext" TEXT;
