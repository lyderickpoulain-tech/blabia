-- v5.1 : guide de mise en place des outils (page Outils, généré à la demande)
-- Pas à pas pour relier dépôt, hébergeur, nom de domaine… avec les outils retenus.
ALTER TABLE "Project" ADD COLUMN "toolsGuide" TEXT;
ALTER TABLE "Project" ADD COLUMN "toolsGuideAt" TIMESTAMP(3);
