-- v6 phase 3 (16/11/2026) : le cap et la fin — migration additive uniquement.

-- Chaque version dit où en est chaque phrase « Ce sera fini quand… » et quelles sont les
-- une ou deux prochaines étapes, déduites de ce qui manque.
ALTER TABLE "WorkVersion" ADD COLUMN "criteriaStatus" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "WorkVersion" ADD COLUMN "nextSteps" JSONB NOT NULL DEFAULT '[]';

-- Livraison : le porteur reçoit le dossier final (version livrée et date).
ALTER TABLE "Work" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Work" ADD COLUMN "deliveredVersion" INTEGER;
