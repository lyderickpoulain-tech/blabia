-- v5.1 (18/10/2026) : « Votre vision » — ce que BlabIA a compris du projet, avec les mots du
-- porteur, corrigé et validé par lui (référence pour toutes les réunions). Migration additive.
ALTER TABLE "Project" ADD COLUMN "vision" TEXT;
ALTER TABLE "Project" ADD COLUMN "visionStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "visionUpdatedAt" TIMESTAMP(3);
