# Déploiement et exploitation

## Images

- `backend/Dockerfile` (contexte : racine du dépôt) : une image pour l'API (`node dist/server.js`, migrations `prisma migrate deploy` au démarrage) et le worker (`node dist/worker.js`). Inclut poppler et Tesseract (fra, eng). Étape `test` pour la CI.
- `web/Dockerfile` : build Vite puis nginx (fichiers statiques + relais `/api`).
- `infrastructure/docker/android/Dockerfile` : construction de l'APK sans Android Studio.

## Configuration par environnement

Toutes les valeurs passent par les variables d'environnement (voir `.env.example`, validées au démarrage par `backend/src/config/env.ts` — l'API refuse de démarrer si un secret manque). Aucun secret dans les clients : l'APK ne contient que l'URL publique de l'API.

| Variable | Production |
|---|---|
| `DATABASE_URL` | PostgreSQL managé, TLS |
| `JWT_ACCESS_SECRET`, `FILE_TOKEN_SECRET` | 48+ octets aléatoires, gestionnaire de secrets |
| `COOKIE_SECURE` | `true` (HTTPS obligatoire) |
| `CORS_ORIGINS`, `PUBLIC_WEB_URL` | domaines réels |
| `S3_*` | bucket privé, chiffrement SSE-KMS, `S3_ENDPOINT` vide pour AWS |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_DAILY_REQUEST_LIMIT` | selon budget |
| `MAX_UPLOAD_MB` | aligner `client_max_body_size` de nginx |

## Mise en production (exemple)

1. Base PostgreSQL et bucket S3 managés ; secrets dans le gestionnaire du fournisseur cloud.
2. Déployer `studymate-backend` en deux services (api ×N, worker ×M — la file PostgreSQL supporte plusieurs workers).
3. Déployer `studymate-web` derrière un équilibreur HTTPS ; router `/api` vers l'API sur le même domaine (cookies `SameSite=Strict`).
4. Android : `./gradlew assembleRelease -Pstudymate.apiUrl=https://api.exemple.cd/` avec une clé de signature (Play App Signing), puis préparation de la fiche Play Store (politique de confidentialité, déclaration des données, permission caméra).

## Migrations

Créées en développement (`npm run migrate:dev` dans `backend/`), versionnées dans `backend/prisma/migrations`, appliquées automatiquement en production (`prisma migrate deploy`, non destructif).

## Sauvegarde et restauration

- PostgreSQL : sauvegardes automatiques du service managé + restauration à un instant donné ; en auto-hébergé : `pg_dump -Fc` quotidien chiffré hors site, test de restauration mensuel.
- S3 : versionnement du bucket et réplication inter-régions ; les clés d'objets sont préfixées par utilisateur (`users/<id>/documents/<id>/`), ce qui permet la suppression complète d'un compte.
- Restaurer la base et le stockage au même instant pour garder la cohérence documents ↔ métadonnées.

## Observabilité

- Journaux JSON structurés (pino) avec masquage des données sensibles ; `/health` vérifie la base.
- IA : `AiUsage` (latence, jetons, coût, erreurs) et journaux « Génération IA ».
- Documents : journaux du worker (durée, méthode, nombre de passages), table `DocumentProcessingJob` (tentatives, codes d'erreur).
- À ajouter : collecte des erreurs (Sentry ou équivalent), métriques (Prometheus / OpenTelemetry), alertes sur la file de tâches et le taux d'erreurs IA.

## CI/CD

`.github/workflows/ci.yml` : tests et typage backend (avec PostgreSQL), tests et build web, tests unitaires et APK Android, construction des images Docker.
