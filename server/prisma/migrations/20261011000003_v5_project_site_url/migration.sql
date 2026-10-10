-- v5.1 : adresse publique du site, renseignée par le propriétaire (Développements).
-- Les hébergeurs comme Railway ne la transmettent pas à GitHub (lien du tableau de bord seulement).
ALTER TABLE "Project" ADD COLUMN "siteUrl" TEXT;
