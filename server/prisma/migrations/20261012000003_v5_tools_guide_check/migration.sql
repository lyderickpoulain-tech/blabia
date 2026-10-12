-- Guide de mise en place : étiquette de vérification en ligne + brouillon en attente de confirmation.
-- Colonnes additives, nullables : NULL = guide enregistré avant cette version = « à vérifier ».
ALTER TABLE "Project" ADD COLUMN "toolsGuideCheck" JSONB;
ALTER TABLE "Project" ADD COLUMN "toolsGuideDraft" JSONB;
