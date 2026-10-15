-- v5.1 (16/10/2026) : avis de l'humain sur les bulles des agents (« à côté de la plaque »,
-- « trop technique », « trop long », « bien vu »), transmis aux agents comme préférences
-- apprises ; et comptes rendus déclinés en formats (relevé de décisions, synthèse
-- exécutive, procès-verbal), générés à la demande puis conservés.
CREATE TABLE "AgentFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sessionId" TEXT,
    "messageId" TEXT NOT NULL,
    "agentName" TEXT,
    "kind" TEXT NOT NULL,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AgentFeedback_kind_check" CHECK ("kind" IN ('off_topic', 'too_technical', 'too_long', 'good'))
);
CREATE UNIQUE INDEX "AgentFeedback_userId_messageId_key" ON "AgentFeedback"("userId", "messageId");
CREATE INDEX "AgentFeedback_userId_createdAt_idx" ON "AgentFeedback"("userId", "createdAt");
ALTER TABLE "AgentFeedback" ADD CONSTRAINT "AgentFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentFeedback" ADD CONSTRAINT "AgentFeedback_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentFeedback" ADD CONSTRAINT "AgentFeedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "summaryFormats" JSONB;
