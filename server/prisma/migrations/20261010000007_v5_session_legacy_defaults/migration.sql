-- v5.1 : préparation du nettoyage des colonnes DEPRECATED de Session (non destructif)
-- agents et exchanges (v1/v2) ne sont plus lus nulle part : remplacés par activeAgents
-- et messages. Une valeur par défaut permet de ne plus les écrire à la création d'une
-- réunion. Aucune donnée existante n'est modifiée ; la suppression des colonnes reste
-- à décider plus tard (accord explicite requis).
ALTER TABLE "Session" ALTER COLUMN "agents" SET DEFAULT '[]';
ALTER TABLE "Session" ALTER COLUMN "exchanges" SET DEFAULT '[]';
