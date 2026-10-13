-- v5.1 : présence des participants sur un projet (voyant vert / dernière venue sur la carte du projet)
CREATE TABLE "ProjectPresence" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectPresence_pkey" PRIMARY KEY ("projectId","userId")
);
ALTER TABLE "ProjectPresence" ADD CONSTRAINT "ProjectPresence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectPresence" ADD CONSTRAINT "ProjectPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
