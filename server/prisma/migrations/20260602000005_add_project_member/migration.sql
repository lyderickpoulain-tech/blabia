-- CreateTable ProjectMember
CREATE TABLE "ProjectMember" (
    "id"        TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "role"      TEXT NOT NULL DEFAULT 'collaborator',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectMember_projectId_userId_key" UNIQUE ("projectId", "userId")
);

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable Invitation : lier une invitation à un projet spécifique (auto-adhésion au register)
ALTER TABLE "Invitation" ADD COLUMN "projectId" TEXT;

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
