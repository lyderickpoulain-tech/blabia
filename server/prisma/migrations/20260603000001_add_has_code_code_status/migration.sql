-- AlterTable
ALTER TABLE "Session" ADD COLUMN "hasCode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN "codeStatus" TEXT;
