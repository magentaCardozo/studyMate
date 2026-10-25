# Architecture

```
            ┌──────────────┐        ┌──────────────────┐
 Navigateur │  web (nginx) │ /api → │  api (Express)   │──┐
 ─────────► │  React SPA   │        │  /api/v1, Swagger│  │   ┌──────────────┐
            └──────────────┘        └────────┬─────────┘  ├──►│ PostgreSQL   │
 Android ──────── HTTPS + Bearer ───────────►│            │   └──────────────┘
 (Room, WorkManager)                         │            │   ┌──────────────┐
                                    ┌────────▼─────────┐  ├──►│ S3 (privé)   │
                                    │ worker           │──┘   └──────────────┘
                                    │ OCR, extraction, │      ┌──────────────┐
                                    │ rappels          │      │ Fournisseur  │
                                    └──────────────────┘      │ IA (option)  │ ◄── api uniquement
                                                              └──────────────┘
```

## Backend (`backend/src`)

- `app.ts` assemble Express : helmet, CORS sur liste blanche, cookies, journaux pino, limitation de débit, `/health`, Swagger (`/api/docs`), puis les routeurs.
- `modules/<domaine>/` : routes (validation Zod en entrée), services (logique métier). Domaines : `auth`, `users`, `academic-years`, `courses`, `folders`, `lessons`, `documents`, `notes`, `flashcards`, `quizzes`, `ai`, `study-plans`, `progress`, `notifications`, `search`, `synchronization`.
- `services/` : briques transverses — `ownership` (contrôle de propriété centralisé), `storage` (S3 / mémoire), `file-tokens` (URL signées), `extraction` (poppler, mammoth, Tesseract, découpage), `jobs` (file PostgreSQL `FOR UPDATE SKIP LOCKED`), `srs` (SM-2), `quiz-scoring`, `planner`, `notifications`, `audit`.
- `worker.ts` : traite les tâches de documents (3 tentatives, recul exponentiel, reprise des tâches bloquées) et génère les rappels toutes les 5 minutes.
- Format de réponse : `{ data, meta? }` ; erreurs : `{ error: { code, message, details? } }` ; jamais de pile d'appel en production.

## Modèle de données (`backend/prisma/schema.prisma`)

`User` → `Course` = **dossier de premier niveau** (base de connaissances ; `semesterId` facultatif pour le classement par `AcademicYear` / `Semester`) → `Folder` (sous-dossiers, auto-référence `parentFolderId`) → `Lesson` (facultatives). `Document` : `courseId` **obligatoire** (dossier), `folderId` facultatif (sous-dossier), `source` = `file` | `scan` | `text` ; jamais rattaché à une leçon ni à un autre document → `DocumentChunk` (passages pour recherche et RAG) et `DocumentProcessingJob`. La base de connaissances d'un dossier est l'ensemble de ses documents (sous-dossiers compris). `Note`, `Summary` (provenance `sources`), `FlashcardDeck` → `Flashcard` (état SM-2) → `FlashcardReview`, `Quiz` → `QuizQuestion`, `QuizAttempt` → `QuizResponse`, `StudyGoal`, `StudySession`, `ChatThread` → `ChatMessage`, `Notification`, `AiUsage`, `AiFeedback`, `AuditLog`, `RefreshToken`, `PasswordResetToken`, `SyncOperation` (idempotence), `Tombstone` (suppressions pour la synchronisation).

Les identifiants sont des UUID (générables côté client hors ligne). Les fichiers et le texte extrait complet sont dans S3 ; seuls les passages découpés sont en base. Suppression en cascade depuis l'utilisateur et le dossier (documents compris) ; un sous-dossier supprimé conserve ses documents et notes à la racine du dossier.

## Web (`web/src`)

- `lib/api.ts` : client unique (cookies, en-tête anti-CSRF, rafraîchissement automatique, erreurs typées).
- `components/ui` : système de design (boutons, champs, dialogues accessibles, états vides / erreur / chargement, toasts, menus clavier, Markdown + KaTeX, logo).
- `features/<domaine>` : pages chargées à la demande (bundle initial ≈ 115 Ko gzippé).
- TanStack Query pour le cache serveur ; préférences d'affichage dans `localStorage`.

## Android (`android/app/src/main/java/com/studymateai`)

- `core/network` (Retrofit, authentificateur OkHttp avec rotation), `core/security` (Keystore), `core/database` (Room), `core/designsystem` (thème Material 3 cramoisi / ivoire).
- `data/repositories` (lecture Room, écriture locale + file), `data/synchronization` (`SyncRepository`, `SyncWorker`).
- `domain` : `Srs` et `QuizScoring`, copies exactes de la logique serveur.
- `feature/*` : écrans Compose ; `navigation/AppNavigation.kt` : 5 onglets (Accueil, Mes cours, Révisions, Mon coach, Profil).
- Injection de dépendances manuelle (`app/StudyMateApp.kt`).
