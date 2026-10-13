-- v5.1 : connecteur Railway (services/railway.js) — accès chiffré de l'utilisateur, mise en ligne du projet
ALTER TABLE "User" ADD COLUMN "railwayRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "railwayConnectedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "railwayEmail" TEXT;
ALTER TABLE "Project" ADD COLUMN "railwaySetup" JSONB;
