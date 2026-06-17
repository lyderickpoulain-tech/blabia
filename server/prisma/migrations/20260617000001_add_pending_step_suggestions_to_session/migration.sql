-- BlabIA v3.6 - Évolution 2 : suggestions d'étapes conditionnelles
-- pendingStepSuggestions : étapes suggérées hors-contexte, stockées silencieusement
ALTER TABLE "Session" ADD COLUMN "pendingStepSuggestions" JSONB DEFAULT '[]';
