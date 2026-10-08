-- v5.0 Phase 2.4/2.5 : curseurs "maîtrise du sujet" et "humour"
-- Project.* = valeur par défaut du projet ; Session.* (nullable) = surcharge
-- pour une réunion précise, null = hérite du projet.

ALTER TABLE "Project" ADD COLUMN "expertiseLevel" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Project" ADD COLUMN "humorLevel"     INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "Session" ADD COLUMN "expertiseLevel" INTEGER;
ALTER TABLE "Session" ADD COLUMN "humorLevel"     INTEGER;

ALTER TABLE "Project" ADD CONSTRAINT project_expertise_level_check CHECK ("expertiseLevel" BETWEEN 1 AND 5);
ALTER TABLE "Project" ADD CONSTRAINT project_humor_level_check     CHECK ("humorLevel" BETWEEN 1 AND 5);
ALTER TABLE "Session" ADD CONSTRAINT session_expertise_level_check CHECK ("expertiseLevel" IS NULL OR "expertiseLevel" BETWEEN 1 AND 5);
ALTER TABLE "Session" ADD CONSTRAINT session_humor_level_check     CHECK ("humorLevel" IS NULL OR "humorLevel" BETWEEN 1 AND 5);
