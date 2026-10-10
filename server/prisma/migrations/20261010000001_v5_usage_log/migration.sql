-- v5.1 : coût réel de l'IA (table additive)
-- Une ligne par appel à l'API Anthropic, avec l'usage exact renvoyé par l'API
-- (tokens d'entrée, de sortie, de cache, recherches web) et le coût calculé au
-- tarif du modèle. Remplace l'estimation « ~€ » fondée sur Session.tokensUsed,
-- qui ne comptait que les tours de chat.
-- kind : origine de l'appel (chat, generate-deliverable, quick-command, …)
-- sessionId : SET NULL à la réinitialisation, pour que le coût reste imputé au projet.
CREATE TABLE "UsageLog" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"           TEXT,
  "projectId"        TEXT,
  "sessionId"        TEXT,
  "kind"             TEXT NOT NULL DEFAULT 'other',
  "model"            TEXT NOT NULL,
  "inputTokens"      INTEGER NOT NULL DEFAULT 0,
  "outputTokens"     INTEGER NOT NULL DEFAULT 0,
  "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
  "cacheReadTokens"  INTEGER NOT NULL DEFAULT 0,
  "webSearches"      INTEGER NOT NULL DEFAULT 0,
  "costUSD"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UsageLog_userId_fkey"    FOREIGN KEY ("userId")    REFERENCES "User"("id")    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "UsageLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "UsageLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "UsageLog_projectId_idx" ON "UsageLog"("projectId");
CREATE INDEX "UsageLog_createdAt_idx" ON "UsageLog"("createdAt");
