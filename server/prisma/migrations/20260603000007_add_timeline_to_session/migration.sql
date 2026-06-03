-- AlterTable
ALTER TABLE "Session" ADD COLUMN "timeline" JSONB NOT NULL DEFAULT '[]'::jsonb;
