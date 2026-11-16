-- v6 phase 2 (16/11/2026) : la réunion améliore l'ouvrage — migration additive uniquement.

-- Réunion de revue : elle porte sur une version de l'ouvrage (null = réunion v5.1).
ALTER TABLE "Session" ADD COLUMN "reviewOfVersion" INTEGER;

-- Proposition de version suivante : écrite par le constructeur (après une réunion, une
-- retouche ou des changements du porteur), elle ne devient une version qu'acceptée par lui.
-- « parsed » garde suppositions, idées et critères lus dans la sortie, appliqués à l'acceptation.
CREATE TABLE "WorkProposal" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'changes',
    "sessionId" TEXT,
    "content" TEXT NOT NULL,
    "changeSummary" TEXT,
    "parsed" JSONB NOT NULL DEFAULT '{}',
    "commentIds" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT,
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "acceptedVersion" INTEGER,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "WorkProposal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkProposal_origin_check" CHECK ("origin" IN ('changes', 'review', 'retouch')),
    CONSTRAINT "WorkProposal_status_check" CHECK ("status" IN ('proposed', 'accepted', 'corrected', 'refused'))
);
CREATE INDEX "WorkProposal_workId_status_idx" ON "WorkProposal"("workId", "status");
ALTER TABLE "WorkProposal" ADD CONSTRAINT "WorkProposal_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkProposal" ADD CONSTRAINT "WorkProposal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Dernière écriture demandée (origine, réunion, proposition corrigée) : « Réessayer » la relance
-- telle quelle après un échec.
ALTER TABLE "Work" ADD COLUMN "buildRequest" JSONB;
