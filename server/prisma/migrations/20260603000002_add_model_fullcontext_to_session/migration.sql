-- AlterTable
ALTER TABLE "Session" ADD COLUMN "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';
ALTER TABLE "Session" ADD COLUMN "fullContext" BOOLEAN NOT NULL DEFAULT false;
