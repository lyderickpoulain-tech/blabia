-- v6 (16/11/2026) : « l'ouvrage d'abord » — migration additive uniquement.

-- Mode avancé, par personne : rouvre tout ce que la v6 masque. Activé pour les comptes
-- d'administration existants (le porteur ne perd rien).
ALTER TABLE "User" ADD COLUMN "advancedMode" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "advancedMode" = true WHERE "role" IN ('admin', 'supervisor');

-- L'ouvrage du projet (un par projet) : genre, version en cours, « Ce sera fini quand… »,
-- état de la construction en cours.
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "genre" TEXT NOT NULL DEFAULT 'dossier',
    "template" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "buildStatus" TEXT NOT NULL DEFAULT 'idle',
    "buildStage" TEXT,
    "buildError" TEXT,
    "buildStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Work_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Work_buildStatus_check" CHECK ("buildStatus" IN ('idle', 'building', 'failed'))
);
CREATE UNIQUE INDEX "Work_projectId_key" ON "Work"("projectId");
ALTER TABLE "Work" ADD CONSTRAINT "Work_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Versions successives de l'ouvrage : contenu, auteur, ce qui a changé, présence des idées.
CREATE TABLE "WorkVersion" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "genre" TEXT NOT NULL DEFAULT 'dossier',
    "content" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT 'builder',
    "changeSummary" TEXT,
    "ideasPresence" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT,
    "durationMs" INTEGER,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkVersion_workId_number_key" ON "WorkVersion"("workId", "number");
ALTER TABLE "WorkVersion" ADD CONSTRAINT "WorkVersion_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Suppositions : ce que le porteur n'a pas dit, affiché et modifiable ; ne bloque jamais rien.
CREATE TABLE "WorkAssumption" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'assumed',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "changedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkAssumption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkAssumption_state_check" CHECK ("state" IN ('assumed', 'changed', 'applied', 'retired'))
);
CREATE INDEX "WorkAssumption_workId_idx" ON "WorkAssumption"("workId");
ALTER TABLE "WorkAssumption" ADD CONSTRAINT "WorkAssumption_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Idées du porteur, avec ses mots ; leur présence est suivie version par version.
CREATE TABLE "WorkIdea" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'recit',
    "sourceRef" TEXT,
    "state" TEXT NOT NULL DEFAULT 'active',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkIdea_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkIdea_state_check" CHECK ("state" IN ('active', 'set_aside'))
);
CREATE INDEX "WorkIdea_workId_idx" ON "WorkIdea"("workId");
ALTER TABLE "WorkIdea" ADD CONSTRAINT "WorkIdea_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Commentaires du porteur sur une partie de l'ouvrage, pris en compte à la version suivante.
CREATE TABLE "WorkComment" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "section" TEXT,
    "content" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "addressedInVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkComment_status_check" CHECK ("status" IN ('open', 'addressed'))
);
CREATE INDEX "WorkComment_workId_idx" ON "WorkComment"("workId");
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
