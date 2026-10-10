-- v5.1 : discussion sous le guide de mise en place (questions, messages d'erreur collés)
-- [{ role: user|assistant, content, at }] ; nourrit le guide suivant
ALTER TABLE "Project" ADD COLUMN "toolsGuideChat" JSONB NOT NULL DEFAULT '[]';
