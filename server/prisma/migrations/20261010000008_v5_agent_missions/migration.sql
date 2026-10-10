-- v5.1 : missions des agents (table additive + budget mensuel par projet)
-- Un agent propose en réunion une mission approfondie (recherche, analyse, rédaction) ;
-- l'humain la valide ; un sous-agent la mène en arrière-plan avec un plafond de coût ;
-- le rapport rejoint les documents de référence du projet.
-- status : proposed → queued → running → done | failed ; ou rejected / cancelled.
CREATE TABLE "AgentMission" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "projectId"   TEXT NOT NULL,
  "sessionId"   TEXT,
  "agentName"   TEXT NOT NULL,
  "kind"        TEXT NOT NULL DEFAULT 'research',
  "title"       TEXT NOT NULL,
  "objective"   TEXT NOT NULL,
  "deliverable" TEXT,
  "status"      TEXT NOT NULL DEFAULT 'proposed',
  "budgetUSD"   DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "costUSD"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "report"      TEXT,
  "sources"     JSONB NOT NULL DEFAULT '[]',
  "error"       TEXT,
  "documentId"  TEXT,
  "approvedBy"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt"  TIMESTAMP(3),
  "startedAt"   TIMESTAMP(3),
  "finishedAt"  TIMESTAMP(3),
  CONSTRAINT "AgentMission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentMission_projectId_fkey"  FOREIGN KEY ("projectId")  REFERENCES "Project"("id")         ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "AgentMission_sessionId_fkey"  FOREIGN KEY ("sessionId")  REFERENCES "Session"("id")         ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AgentMission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AgentMission_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id")            ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT agent_mission_status_check CHECK ("status" IN ('proposed', 'queued', 'running', 'done', 'failed', 'rejected', 'cancelled')),
  CONSTRAINT agent_mission_kind_check   CHECK ("kind" IN ('research', 'analysis', 'writing'))
);

CREATE INDEX "AgentMission_projectId_idx" ON "AgentMission"("projectId");
CREATE INDEX "AgentMission_status_idx" ON "AgentMission"("status");

ALTER TABLE "Project" ADD COLUMN "missionsMonthlyBudgetUSD" DOUBLE PRECISION NOT NULL DEFAULT 5;
