-- v5.1 : contradicteur (avocat du diable sélectif) — colonnes additives
-- Project.challengerEnabled : activé par défaut sur chaque projet.
-- Session.challengerEnabled : NULL = hérite du projet ; false = désactivé pour cette réunion.
ALTER TABLE "Project" ADD COLUMN "challengerEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Session" ADD COLUMN "challengerEnabled" BOOLEAN;
