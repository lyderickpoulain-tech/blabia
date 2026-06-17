-- BlabIA v3.6 - Évolution 3 : affichage des tokens consommés
-- tokensUsed : cumul des tokens Anthropic par session { input, output, total }
ALTER TABLE "Session" ADD COLUMN "tokensUsed" JSONB DEFAULT '{"input":0,"output":0,"total":0}';
