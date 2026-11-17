-- BlabIA + (18/11/2026) : adresse au nom du porteur (son propre nom de domaine) — migration additive.
ALTER TABLE "SitePublication" ADD COLUMN "customHostname" TEXT;
ALTER TABLE "SitePublication" ADD COLUMN "customHostnameId" TEXT;
ALTER TABLE "SitePublication" ADD COLUMN "customStatus" TEXT;
CREATE UNIQUE INDEX "SitePublication_customHostname_key" ON "SitePublication"("customHostname");
