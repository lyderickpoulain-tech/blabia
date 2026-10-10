-- v5.1 : publication réelle des développements (déploiements GitHub déclarés par l'hébergeur)
-- previewUrl : aperçu de la pull request ; siteUrl : site publié après fusion
-- publishState : pending | live | failed | no_host (aucun hébergeur relié) | unknown (lecture impossible)
ALTER TABLE "DevTask" ADD COLUMN "previewUrl" TEXT;
ALTER TABLE "DevTask" ADD COLUMN "siteUrl" TEXT;
ALTER TABLE "DevTask" ADD COLUMN "mergeSha" TEXT;
ALTER TABLE "DevTask" ADD COLUMN "publishState" TEXT;
