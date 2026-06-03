-- AlterTable
ALTER TABLE "Session" ADD COLUMN "milestoneId" TEXT REFERENCES "Milestone"(id) ON DELETE SET NULL;

-- Index pour accélerer les lookups par milestone
CREATE INDEX "Session_milestoneId_idx" ON "Session"("milestoneId");
