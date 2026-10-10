-- v5.1 : guide de prise en main (colonne additive)
-- NULL = guide jamais vu → affiché automatiquement à la connexion ;
-- renseigné dès que l'utilisateur le termine ou le ferme. Rejouable à la demande.
ALTER TABLE "User" ADD COLUMN "tutorialSeenAt" TIMESTAMP(3);
