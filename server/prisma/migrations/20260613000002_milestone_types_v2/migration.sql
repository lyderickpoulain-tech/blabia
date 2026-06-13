-- Alignement des types Milestone sur les intentions de session
UPDATE "Milestone" SET type = 'synthesis'   WHERE type = 'meeting';
UPDATE "Milestone" SET type = 'claude_code' WHERE type = 'technical';
-- stack_check et milestone inchangés
