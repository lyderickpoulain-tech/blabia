-- BlabIA v3.9 - Évolution 7 : gestion des rôles utilisateurs
-- Nouveaux rôles : user, member, admin, supervisor
-- guest → member, contact@rasia-editions.fr → supervisor

-- Changer la valeur par défaut
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'member';

-- Migrer les données existantes
UPDATE "User" SET "role" = 'supervisor' WHERE "email" = 'contact@rasia-editions.fr';
UPDATE "User" SET "role" = 'member' WHERE "role" = 'guest';
-- Les admin restent admin, les autres rôles inconnus deviennent member
UPDATE "User" SET "role" = 'member' WHERE "role" NOT IN ('user', 'member', 'admin', 'supervisor');
