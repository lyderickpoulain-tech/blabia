-- v5.1 : rappels hebdomadaires par e-mail des actions entre les réunions (colonnes additives)
-- Project.remindersEnabled : rappels activés pour ce projet (désactivés par défaut).
-- User.reminderDay : jour d'envoi, 1 = lundi … 7 = dimanche (lundi par défaut).
-- User.remindersLastSentAt : dernier envoi (un seul rappel par semaine, même si la
--   vérification tourne plusieurs fois).
ALTER TABLE "Project" ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "reminderDay" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN "remindersLastSentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD CONSTRAINT user_reminder_day_check CHECK ("reminderDay" BETWEEN 1 AND 7);
