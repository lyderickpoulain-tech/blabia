-- CreateTable Milestone
CREATE TABLE "Milestone" (
  "id"           TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "projectId"    TEXT      NOT NULL,
  "title"        TEXT      NOT NULL,
  "description"  TEXT,
  "dueDate"      TIMESTAMP,
  "status"       TEXT      NOT NULL DEFAULT 'pending',
  "displayOrder" INTEGER   NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
  "createdBy"    TEXT,

  CONSTRAINT "Milestone_pkey"            PRIMARY KEY ("id"),
  CONSTRAINT "Milestone_projectId_fkey"  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "Milestone_createdBy_fkey"  FOREIGN KEY ("createdBy") REFERENCES "User"("id")    ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable TodoItem
CREATE TABLE "TodoItem" (
  "id"           TEXT      NOT NULL DEFAULT gen_random_uuid()::text,
  "projectId"    TEXT      NOT NULL,
  "milestoneId"  TEXT,
  "title"        TEXT      NOT NULL,
  "description"  TEXT,
  "status"       TEXT      NOT NULL DEFAULT 'todo',
  "priority"     TEXT      NOT NULL DEFAULT 'medium',
  "dueDate"      TIMESTAMP,
  "displayOrder" INTEGER   NOT NULL DEFAULT 0,
  "source"       TEXT      NOT NULL DEFAULT 'manual',
  "sessionId"    TEXT,
  "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
  "createdBy"    TEXT,

  CONSTRAINT "TodoItem_pkey"            PRIMARY KEY ("id"),
  CONSTRAINT "TodoItem_projectId_fkey"  FOREIGN KEY ("projectId")   REFERENCES "Project"("id")   ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "TodoItem_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TodoItem_sessionId_fkey"  FOREIGN KEY ("sessionId")   REFERENCES "Session"("id")   ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TodoItem_createdBy_fkey"  FOREIGN KEY ("createdBy")   REFERENCES "User"("id")      ON DELETE SET NULL ON UPDATE CASCADE
);
