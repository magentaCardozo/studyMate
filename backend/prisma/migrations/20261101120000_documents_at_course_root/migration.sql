-- Les documents se déposent uniquement à la racine du dossier du cours :
-- ceux qui étaient rangés dans un sous-dossier y sont ramenés (aucune donnée supprimée).
UPDATE "Document" SET "folderId" = NULL WHERE "folderId" IS NOT NULL;
