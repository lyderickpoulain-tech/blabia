-- v5.1 : réunion « reportée » le temps d'une mission (services/missions.js, postponeMeetingForMission)
ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS session_status_check;
ALTER TABLE "Session" ADD CONSTRAINT session_status_check CHECK (status IN ('open', 'accepted', 'abandoned', 'postponed'));
