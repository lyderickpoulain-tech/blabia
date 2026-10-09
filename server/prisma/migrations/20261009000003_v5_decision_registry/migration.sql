-- v5.0 : registre des décisions du projet (table additive)
-- Alimenté à la clôture des réunions après validation de l'humain ; transmis aux
-- agents pour qu'ils ne redemandent pas ce qui est déjà tranché.
-- origin : 'human' (réponse à une carte / arbitrage explicite) | 'agents' (hypothèse non contredite)
-- status : 'active' | 'reopened' (remise en question par l'humain) | 'superseded' (remplacée)
CREATE TABLE "Decision" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "projectId"       TEXT NOT NULL,
  "sessionId"       TEXT,
  "statement"       TEXT NOT NULL,
  "rationale"       TEXT,
  "rejectedOptions" JSONB NOT NULL DEFAULT '[]',
  "origin"          TEXT NOT NULL DEFAULT 'human',
  "status"          TEXT NOT NULL DEFAULT 'active',
  "reopenNote"      TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Decision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Decision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Decision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT decision_origin_check CHECK ("origin" IN ('human', 'agents')),
  CONSTRAINT decision_status_check CHECK ("status" IN ('active', 'reopened', 'superseded'))
);

CREATE INDEX "Decision_projectId_status_idx" ON "Decision"("projectId", "status");
