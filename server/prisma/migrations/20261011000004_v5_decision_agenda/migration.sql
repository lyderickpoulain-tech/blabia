-- v5.1 : ordre du jour des réunions de décision (services/agenda.js) : décisions remises
-- en question à retraiter ; la décision qui les retraite les remplace (supersededBy).
ALTER TABLE "Milestone" ADD COLUMN "agenda" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Decision" ADD COLUMN "supersededBy" TEXT;
