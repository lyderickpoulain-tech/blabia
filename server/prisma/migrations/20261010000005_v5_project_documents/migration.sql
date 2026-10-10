-- v5.1 : documents de référence du projet (table additive)
-- Texte extrait une fois au dépôt (PDF, Word, Excel, CSV, texte) ; les documents
-- actifs (enabled) sont lus par les agents à chaque réunion (bloc commun mis en cache).
CREATE TABLE "ProjectDocument" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "projectId"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "mimeType"   TEXT,
  "sizeBytes"  INTEGER NOT NULL DEFAULT 0,
  "charCount"  INTEGER NOT NULL DEFAULT 0,
  "content"    TEXT NOT NULL,
  "enabled"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"  TEXT,
  CONSTRAINT "ProjectDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectDocument_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ProjectDocument_projectId_idx" ON "ProjectDocument"("projectId");
