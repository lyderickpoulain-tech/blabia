-- v5.1 : développement depuis BlabIA (Claude Code dans GitHub Actions)
-- L'utilisateur connecte son compte GitHub (application GitHub BlabIA installée sur ses
-- dépôts) ; le propriétaire d'un projet choisit le dépôt ; « Lancer le développement »
-- crée une demande (issue) et déclenche Claude Code, qui ouvre une pull request ;
-- « Mettre en ligne » sauvegarde la base (si déclarée) puis fusionne.
-- Le jeton d'abonnement Claude reste dans les secrets du dépôt : BlabIA ne le voit jamais.
ALTER TABLE "User" ADD COLUMN "githubInstallationId" TEXT;
ALTER TABLE "User" ADD COLUMN "githubLogin" TEXT;
ALTER TABLE "Project" ADD COLUMN "githubRepo" TEXT;

-- status : running → ready → deploying → deployed ; ou failed / deploy_failed / abandoned
CREATE TABLE "DevTask" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "projectId"         TEXT NOT NULL,
  "sessionId"         TEXT,
  "createdBy"         TEXT,
  "repo"              TEXT NOT NULL,
  "title"             TEXT NOT NULL,
  "prompt"            TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'running',
  "issueNumber"       INTEGER,
  "issueUrl"          TEXT,
  "prNumber"          INTEGER,
  "prUrl"             TEXT,
  "summary"           TEXT,
  "files"             JSONB NOT NULL DEFAULT '[]',
  "touchesDatabase"   BOOLEAN NOT NULL DEFAULT false,
  "runUrl"            TEXT,
  "error"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt"           TIMESTAMP(3),
  "deployRequestedAt" TIMESTAMP(3),
  "finishedAt"        TIMESTAMP(3),
  CONSTRAINT "DevTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DevTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "DevTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DevTask_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id")    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT dev_task_status_check CHECK ("status" IN ('running', 'ready', 'failed', 'deploying', 'deployed', 'deploy_failed', 'abandoned'))
);

CREATE INDEX "DevTask_projectId_idx" ON "DevTask"("projectId");
