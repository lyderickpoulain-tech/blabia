-- v5.1 : réunion ouverte depuis une action (« Traiter en réunion ») : l'action et le rapport
-- de sa mission sont transmis aux agents ; l'action est cochée à la conclusion.
ALTER TABLE "Session" ADD COLUMN "todoId" TEXT;
ALTER TABLE "Session" ADD CONSTRAINT "Session_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "TodoItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
