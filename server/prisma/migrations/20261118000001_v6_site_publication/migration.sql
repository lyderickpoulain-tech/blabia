-- BlabIA + (18/11/2026) : mise en ligne du site — migration additive.

-- Le site en ligne d'un projet : son adresse (sous-domaine de SITES_DOMAIN), la construction publiée.
CREATE TABLE "SitePublication" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "buildId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'online',
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SitePublication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SitePublication_status_check" CHECK ("status" IN ('online', 'offline'))
);
CREATE UNIQUE INDEX "SitePublication_projectId_key" ON "SitePublication"("projectId");
CREATE UNIQUE INDEX "SitePublication_slug_key" ON "SitePublication"("slug");
ALTER TABLE "SitePublication" ADD CONSTRAINT "SitePublication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SitePublication" ADD CONSTRAINT "SitePublication_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "SiteBuild"("id") ON DELETE SET NULL ON UPDATE CASCADE;
