-- v5.1 : mission confiée à un agent depuis une action (page Actions)
ALTER TABLE "AgentMission" ADD COLUMN "todoId" TEXT;
ALTER TABLE "AgentMission" ADD CONSTRAINT "AgentMission_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "TodoItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
