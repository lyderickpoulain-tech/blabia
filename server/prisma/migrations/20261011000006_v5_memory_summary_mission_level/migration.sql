-- v5.1 : mémoire à deux étages (services/memory.js) — synthèse consolidée du projet,
-- corrigible par l'humain ; les entrées anciennes y sont fondues au lieu d'être supprimées.
ALTER TABLE "Project" ADD COLUMN "memorySummary" TEXT;
ALTER TABLE "Project" ADD COLUMN "memorySummaryAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "memoryEditedAt" TIMESTAMP(3);
-- v5.1 : niveau d'une mission (légère | standard | approfondie) au lieu d'un montant
ALTER TABLE "AgentMission" ADD COLUMN "level" TEXT NOT NULL DEFAULT 'standard';
