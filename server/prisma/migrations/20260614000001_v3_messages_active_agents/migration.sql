-- BlabIA v3.0 - Évolution 1 : modèle de données conversation
-- messages : fil chronologique de la réunion (format v3.0)
-- activeAgents : agents actifs dans la session (ajoutables en cours de réunion)
ALTER TABLE "Session" ADD COLUMN "messages" JSONB DEFAULT '[]';
ALTER TABLE "Session" ADD COLUMN "activeAgents" JSONB DEFAULT '[]';
