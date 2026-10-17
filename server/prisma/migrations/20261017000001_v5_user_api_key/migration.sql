-- v5.1 (17/10/2026) : « Apportez votre clé API » — la clé Anthropic du porteur de projet (chiffrée),
-- son état, et qui a payé chaque appel. Migration additive.
ALTER TABLE "User" ADD COLUMN "anthropicApiKey" TEXT;
ALTER TABLE "User" ADD COLUMN "anthropicKeyLast4" TEXT;
ALTER TABLE "User" ADD COLUMN "anthropicKeyStatus" TEXT;
ALTER TABLE "User" ADD COLUMN "anthropicKeyError" TEXT;
ALTER TABLE "User" ADD COLUMN "anthropicKeyCheckedAt" TIMESTAMP(3);
ALTER TABLE "UsageLog" ADD COLUMN "billedTo" TEXT NOT NULL DEFAULT 'blabia';
