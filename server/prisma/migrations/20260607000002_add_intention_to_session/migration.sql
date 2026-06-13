-- AlterTable : intention de session (tableau de valeurs : synthesis, memory, claude_code, timeline_steps)
ALTER TABLE "Session" ADD COLUMN "intention" JSONB DEFAULT '[]';
