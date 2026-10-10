-- v5.1 : visite guidée sur un projet exemple (colonnes additives)
-- Project.isDemo : projet exemple créé pour la visite guidée (jeu de données fixe,
--   aucun appel à l'IA autorisé), supprimé à la fin de la visite.
-- User.tourProgress : chapitres de la visite terminés { "<chapitre>": "<date ISO>" }.
ALTER TABLE "Project" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "tourProgress" JSONB NOT NULL DEFAULT '{}';
