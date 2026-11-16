-- BlabIA + (17/11/2026) : construction du site par un agent hébergé — migration additive.

-- Réglages internes de BlabIA (identifiants de l'agent et de l'environnement chez Anthropic).
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- Une construction (ou une retouche) du site d'un projet, à partir d'une version du dossier.
CREATE TABLE "SiteBuild" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'build',
    "request" TEXT,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'building',
    "stage" TEXT,
    "model" TEXT,
    "agentSession" TEXT,
    "costUSD" DECIMAL(10,4),
    "durationMs" INTEGER,
    "report" TEXT,
    "error" TEXT,
    "previewToken" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "SiteBuild_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SiteBuild_kind_check" CHECK ("kind" IN ('build', 'retouch')),
    CONSTRAINT "SiteBuild_status_check" CHECK ("status" IN ('building', 'ready', 'failed'))
);
CREATE UNIQUE INDEX "SiteBuild_previewToken_key" ON "SiteBuild"("previewToken");
CREATE INDEX "SiteBuild_projectId_createdAt_idx" ON "SiteBuild"("projectId", "createdAt");
ALTER TABLE "SiteBuild" ADD CONSTRAINT "SiteBuild_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteBuild" ADD CONSTRAINT "SiteBuild_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les fichiers du site produit (HTML, CSS, images) : servis en aperçu, publiés ensuite.
CREATE TABLE "SiteFile" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    CONSTRAINT "SiteFile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SiteFile_buildId_path_key" ON "SiteFile"("buildId", "path");
ALTER TABLE "SiteFile" ADD CONSTRAINT "SiteFile_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "SiteBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
