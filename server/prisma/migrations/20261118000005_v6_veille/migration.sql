-- v6 (18/11/2026) : veille mensuelle des outils de BlabIA par un agent programmé — migration additive.
-- Un rapport par séance de l'agent (premier lundi du mois, ou lancement à la main).
CREATE TABLE "VeilleReport" (
    "id" TEXT NOT NULL,
    "agentSession" TEXT NOT NULL,
    "runId" TEXT,
    "trigger" TEXT,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "costUSD" DECIMAL(10,4),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VeilleReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VeilleReport_status_check" CHECK ("status" IN ('ready', 'empty', 'failed'))
);
CREATE UNIQUE INDEX "VeilleReport_agentSession_key" ON "VeilleReport"("agentSession");
