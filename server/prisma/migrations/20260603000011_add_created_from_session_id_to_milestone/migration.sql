-- AlterTable : traçabilité session → jalon créé automatiquement
ALTER TABLE "Milestone" ADD COLUMN "createdFromSessionId" TEXT REFERENCES "Session"(id) ON DELETE SET NULL;
