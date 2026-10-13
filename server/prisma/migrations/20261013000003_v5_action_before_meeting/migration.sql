-- v5.1 : action à mener AVANT une réunion du plan ; tant qu'elle n'est ni faite ni supprimée, la réunion ne peut pas se tenir
ALTER TABLE "TodoItem" ADD COLUMN "beforeMilestoneId" TEXT;
ALTER TABLE "TodoItem" ADD CONSTRAINT "TodoItem_beforeMilestoneId_fkey" FOREIGN KEY ("beforeMilestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
