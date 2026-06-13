-- Migration statuts session v2.0
-- open : session ouverte, échanges toujours possibles
-- accepted : résultat validé et appliqué par l'utilisateur
-- abandoned : close sans résultat retenu

UPDATE "Session" SET status = 'open'     WHERE status IN ('incomplete', 'in_progress', 'interrupted');
UPDATE "Session" SET status = 'accepted' WHERE status = 'complete';

ALTER TABLE "Session" ADD CONSTRAINT session_status_check
  CHECK (status IN ('open', 'accepted', 'abandoned'));
