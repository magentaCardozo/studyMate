-- Base de connaissances : tout document appartient à un dossier (entité Course).
-- La boîte « Non classés » et le rattachement direct d'un document à une leçon disparaissent.

-- 1. Données existantes : les documents sans dossier sont rangés dans un dossier créé automatiquement.
INSERT INTO "Course" ("id", "userId", "title", "description", "importance", "isDemo", "createdAt", "updatedAt")
SELECT gen_random_uuid(), o."userId", 'Documents non classés',
       'Créé automatiquement lors de la mise à jour : ces documents n''étaient rangés dans aucun dossier.',
       3, false, now(), now()
FROM (SELECT DISTINCT "userId" FROM "Document" WHERE "courseId" IS NULL) o;

UPDATE "Document" d
SET "courseId" = c."id"
FROM "Course" c
WHERE d."courseId" IS NULL
  AND c."userId" = d."userId"
  AND c."title" = 'Documents non classés'
  AND c."description" LIKE 'Créé automatiquement lors de la mise à jour%';

-- 2. Schéma
ALTER TABLE "Document" DROP CONSTRAINT "Document_courseId_fkey";
ALTER TABLE "Document" DROP CONSTRAINT "Document_lessonId_fkey";
DROP INDEX "Document_lessonId_idx";

ALTER TABLE "Document" DROP COLUMN "lessonId",
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'file',
ALTER COLUMN "courseId" SET NOT NULL;

ALTER TABLE "Document" ADD CONSTRAINT "Document_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
