-- Titres distinctifs pour le contenu généré avant la numérotation :
-- « QCM — Dossier « Statistique » » devient « QCM n° 1 — Statistique » (ordre de création, par dossier).
-- Seuls les titres au format automatique d'origine sont modifiés.

WITH n AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "courseId", split_part(title, ' — ', 1) ORDER BY "createdAt") AS k,
         split_part(title, ' — ', 1) AS prefix,
         substring(title FROM ' — Dossier « (.*) »$') AS name
  FROM "Quiz"
  WHERE title ~ '^(QCM|Quiz|Examen blanc) — Dossier « .* »$'
)
UPDATE "Quiz" q SET title = n.prefix || ' n° ' || n.k || ' — ' || n.name FROM n WHERE q.id = n.id;

WITH n AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "courseId" ORDER BY "createdAt") AS k,
         substring(title FROM ' — Dossier « (.*) »$') AS name
  FROM "FlashcardDeck"
  WHERE title ~ '^Cartes — Dossier « .* »$'
)
UPDATE "FlashcardDeck" d SET title = 'Flash-cards n° ' || n.k || ' — ' || n.name FROM n WHERE d.id = n.id;

WITH n AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "courseId" ORDER BY "createdAt") AS k,
         substring(title FROM ' — Dossier « (.*) »$') AS name
  FROM "Summary"
  WHERE title ~ '^Résumé — Dossier « .* »$'
)
UPDATE "Summary" s SET title = 'Fiche de révision n° ' || n.k || ' — ' || n.name FROM n WHERE s.id = n.id;
