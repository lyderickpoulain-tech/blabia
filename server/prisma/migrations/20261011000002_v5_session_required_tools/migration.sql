-- v5.1 : types d'outils dont dépend le développement d'une réunion Claude Code
-- (services/devTools.js) ; NULL = pas encore repéré. Lancement bloqué si l'un n'est pas mis en place.
ALTER TABLE "Session" ADD COLUMN "requiredTools" JSONB;
