-- AlterTable : flag projet technique (conditionne stack, stack_check, export Claude Code)
ALTER TABLE "Project" ADD COLUMN "isTechnical" BOOLEAN NOT NULL DEFAULT false;
