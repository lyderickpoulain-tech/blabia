-- v5.0 : mode de questions (budget de cartes de décision par réunion)
-- Project.questionMode = défaut du projet ; Session.questionMode (nullable) = surcharge
-- pour une réunion précise, null = hérite du projet. delegate=4, balanced=8, control=15.

ALTER TABLE "Project" ADD COLUMN "questionMode" TEXT NOT NULL DEFAULT 'balanced';
ALTER TABLE "Session" ADD COLUMN "questionMode" TEXT;

ALTER TABLE "Project" ADD CONSTRAINT project_question_mode_check CHECK ("questionMode" IN ('delegate', 'balanced', 'control'));
ALTER TABLE "Session" ADD CONSTRAINT session_question_mode_check CHECK ("questionMode" IS NULL OR "questionMode" IN ('delegate', 'balanced', 'control'));
