-- CreateTable
CREATE TABLE "ProjectAgent" (
  "id"           TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "projectId"    TEXT    NOT NULL,
  "agentId"      TEXT    NOT NULL,
  "enabled"      BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "source"       TEXT    NOT NULL DEFAULT 'manual',

  CONSTRAINT "ProjectAgent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectAgent_projectId_agentId_key" UNIQUE ("projectId", "agentId"),
  CONSTRAINT "ProjectAgent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectAgent_agentId_fkey"  FOREIGN KEY ("agentId")  REFERENCES "Agent"("id")   ON DELETE CASCADE ON UPDATE CASCADE
);
