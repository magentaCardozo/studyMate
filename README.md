# StudyMate AI

Espace académique personnel pour les étudiants de l'enseignement supérieur (RDC et Afrique francophone) : matières, dossiers, leçons, documents, notes, révision active (résumés, cartes mémoire, quiz, examens blancs), programme de révision personnalisé et usage hors ligne sur Android.

> « Organisez votre savoir. Comprenez vos cours. Préparez-vous avec confiance. »

## Fonctionnement : le dossier comme base de connaissances

1. **Créer un dossier** — un par cours, par exemple « Statistique ». C'est l'unité de premier niveau ; le classement par année / semestre est facultatif, les sous-dossiers aussi.
2. **Constituer la base de connaissances** du dossier, de trois façons :
   - **importer un PDF** (Word et fichiers texte acceptés) ;
   - **scanner un document** (photos des pages → PDF, texte reconnu par OCR et corrigible) ;
   - **coller du texte** dans le champ prévu (extrait de cours, notes, transcription).
   Tout document appartient obligatoirement à un dossier. Un document ne peut pas contenir d'autre document, et n'est rattaché ni à une leçon ni à une boîte « non classés ».
3. **Réviser à partir de cette base** : questionnaire à choix multiple (QCM), fiches de révision, cartes mémoire ou examen blanc. Le contenu est généré **uniquement** à partir des documents du dossier (ou d'un sous-dossier), avec les sources citées.

Côté API, le dossier de premier niveau correspond à la ressource historique `/courses` ; `GET /courses/:id/knowledge-base` donne l'état de la base et `POST /documents/text` ajoute un texte collé.

## Contenu du dépôt

| Dossier | Rôle | Technologies |
|---|---|---|
| `backend/` | API REST `/api/v1`, worker de traitement (OCR, extraction), rappels | Node.js 22, TypeScript, Express 5, Prisma 6, PostgreSQL 16, Zod |
| `web/` | Client web responsive (bureau + mobile) | React 18, Vite 6, TypeScript, Tailwind CSS 3, TanStack Query 5, React Router 7 |
| `android/` | Application Android native, hors ligne | Kotlin 2.2, Jetpack Compose (Material 3), Room, WorkManager, Retrofit/OkHttp, CameraX, Keystore |
| `shared/api-contracts/openapi.yaml` | Contrat d'API commun web + Android | OpenAPI 3.1 |
| `infrastructure/` | Scripts Docker (stockage S3, build Android) | — |
| `docs/` | Architecture, synchronisation, sécurité, IA, déploiement | — |

## Démarrage rapide (Docker)

Prérequis : Docker et Docker Compose.

```bash
cp .env.example .env
```

Remplacez les valeurs `change-me` du fichier `.env` (secrets : `openssl rand -base64 48`), puis :

```bash
docker compose up -d --build
```

| Service | Adresse |
|---|---|
| Application web | http://localhost:8088 |
| API | http://localhost:4000/api/v1 |
| Documentation de l'API (Swagger) | http://localhost:4000/api/docs |
| PostgreSQL (local uniquement) | localhost:5433 |

Les migrations sont appliquées automatiquement au démarrage de l'API. Créez un compte depuis l'interface, puis un premier dossier. *Paramètres › Contenu de démonstration* charge deux dossiers d'exemple (marqués « Démo »).

Services Compose : `db` (PostgreSQL), `storage` (SeaweedFS, compatible S3, non exposé), `api`, `worker` (extraction de texte, OCR, rappels), `web` (nginx, relaie `/api` vers l'API sur la même origine).

### IA

Par défaut, `AI_PROVIDER=mock` : **adaptateur de démonstration sans modèle de langage**. Il produit résumés, cartes et quiz par extraction de phrases des documents (avec sources réelles) et l'interface l'indique clairement (« mode démonstration »). Pour utiliser Claude :

```dotenv
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5-5
```

La clé reste côté serveur. Avec un fournisseur externe, chaque étudiant doit donner son accord explicite (*Paramètres › Confidentialité*) avant tout envoi de documents. Voir [docs/ai-integration.md](docs/ai-integration.md).

## Tests

```bash
make test-backend   # 57 tests d'intégration + unitaires (API, sécurité, base de connaissances, IA, quiz, planificateur, synchronisation) dans Docker
make test-web       # tests de composants (Vitest + Testing Library)
cd android && ./gradlew :app:testDebugUnitTest   # logique hors ligne (SM-2, correction locale)
```

Les tests backend utilisent une base dédiée `studymate_test` (créée si absente, migrations non destructives) et un stockage en mémoire. En local hors Docker : `TEST_DATABASE_URL=postgresql://…@localhost:5433/studymate_test npm test` dans `backend/`.

## Développement sans Docker

```bash
docker compose up -d db storage
cd backend && npm ci && npm run dev        # nécessite un .env backend (voir .env.example)
cd web && npm ci && npm run dev            # http://localhost:5173, proxy /api → :4000
```

### Android

Ouvrir `android/` dans Android Studio, ou :

```bash
cd android && ./gradlew :app:assembleDebug
```

L'émulateur joint l'API de la machine hôte via `http://10.0.2.2:4000/` (valeur par défaut). Pour un téléphone réel : `./gradlew assembleDebug -Pstudymate.apiUrl=http://<IP-de-votre-machine>:4000/` (HTTP autorisé uniquement vers l'hôte local en débogage ; HTTPS obligatoire en version release). Construction sans Android Studio : `make android` (APK dans `android/dist/`).

## État d'avancement

### Implémenté et vérifié

- **Comptes** : inscription, connexion, déconnexion (un appareil / tous), rafraîchissement avec rotation et détection de réutilisation, réinitialisation du mot de passe, export des données, suppression du compte. Web : cookies HttpOnly SameSite=Strict + en-tête anti-CSRF. Android : jetons chiffrés par le Keystore.
- **Dossiers et base de connaissances** : dossier obligatoire pour tout document (règle appliquée par le serveur, le web et Android), trois modes d'ajout (PDF, scan, texte collé), état de la base (documents par mode, analyse en cours, volume de texte exploitable), génération désactivée tant que la base est vide. Classement facultatif par année / semestre, sous-dossiers (déplacement avec prévention des cycles, réordonnancement par glisser-déposer ou menu accessible, duplication de structure), leçons facultatives (contenu Markdown + maths, objectifs, définitions, formules, exemples, exercices, statut).
- **Documents** : import sécurisé en 3 étapes (URL signée courte durée, vérification de la signature binaire, stockage S3 privé), texte collé jusqu'à 500 000 caractères, traitement asynchrone avec reprises (extraction poppler, OCR Tesseract fra+eng pour les scans et PDF numérisés), suivi de l'état, aperçu, texte extrait corrigible, recherche dans le texte, téléchargement par lien signé, déplacement / renommage / épinglage / suppression. Migration : les anciens documents sans dossier ont été rangés dans un dossier « Documents non classés » créé automatiquement.
- **Numérisation** : web (photos → PDF multipage, rotation, recadrage, réorganisation, amélioration du contraste) et Android (CameraX → PDF), OCR côté serveur.
- **Notes** : éditeur Markdown (barre d'outils, aperçu KaTeX), sauvegarde automatique, détection de conflit, liaison matière / dossier / leçon / document.
- **Révision intelligente** (à partir de la base d'un dossier ou d'un sous-dossier) : QCM (choix unique et choix multiples par défaut), fiches de révision structurées (3 longueurs) avec provenance par élément, cartes mémoire (génération, création / édition manuelle, étude avec répétition espacée SM-2, historique), quiz (6 types, mode entraînement avec correction immédiate ou mode examen avec réponses masquées jusqu'à la remise, minuteur côté serveur, reprise sans perte, sauvegarde locale en cas de coupure), examens blancs, résultats avec explications, sources, notions manquées et leçons à revoir, signalement d'erreurs.
- **Garde-fous IA** : sorties structurées validées (Zod), clés de correction vérifiées (questions incohérentes écartées), citations limitées aux sources réellement fournies, refus explicite si le contenu est insuffisant, contenu des documents traité comme non fiable, quotas quotidiens, limitation de débit, suivi des coûts et latences, gestion des pannes du fournisseur.
- **Coach** : examens et objectifs, disponibilités, programme de révision explicable (aperçu → acceptation), sessions (terminer, passer, replanifier), sessions manquées redistribuées sans dépasser le temps disponible, tuteur conversationnel avec RAG (BM25) sur les sources autorisées.
- **Calendrier** (mois / semaine / jour), **progression** calculée uniquement à partir des activités réelles, **tableau de bord**, **recherche globale** (avec matière et dossier parents, y compris dans le texte des documents), **notifications** dans l'application (préférences, heures calmes, déduplication).
- **Android** : dossiers avec base de connaissances (PDF via le sélecteur de fichiers, scan CameraX, texte collé — en ligne), génération QCM / fiches / cartes depuis un dossier. **Hors ligne** : dossiers, sous-dossiers, leçons, notes, cartes, quiz d'entraînement et sessions en base Room ; révisions de cartes et quiz hors ligne ; documents téléchargeables (option Wi-Fi uniquement, taille affichée) ; file d'opérations idempotentes, fusion des modifications successives, synchronisation WorkManager au retour du réseau, résolution de conflits documentée — vérifié sur émulateur (modification hors ligne puis synchronisation).

### Partiel ou limité

- **IA réelle** : l'adaptateur Anthropic est implémenté mais n'a pas été exécuté contre l'API faute de clé dans cet environnement ; seul l'adaptateur de démonstration a été testé.
- **Recherche sémantique** : la récupération (RAG) est lexicale (BM25, insensible aux accents) ; pas d'embeddings vectoriels.
- **Web hors ligne** : pas de bibliothèque hors ligne complète (pas de service worker) ; seules les réponses de quiz sont conservées localement en cas de coupure. C'est indiqué dans l'interface.
- **Annotations PDF** : l'aperçu utilise la visionneuse du navigateur (pages, zoom, recherche) ; pas d'annotations ni de signets intégrés.
- **Android** : couvre l'essentiel (cours, leçons, notes, documents, scan, cartes, quiz d'entraînement, agenda, programme, tuteur, synchronisation). La création ou modification avancée (contenu détaillé des leçons, quiz en mode examen, résumés détaillés, paramètres de notification) se fait sur le web. Les maths s'affichent en LaTeX brut sur Android. Les libellés de navigation sont traduits en anglais ; le reste de l'interface Android est en français.
- **Internationalisation web** : navigation et éléments communs en français / anglais ; les pages sont rédigées en français.
- **Notifications push** : non configurées (aucun service FCM) ; notifications dans l'application uniquement.
- **E-mail** : aucun service d'envoi ; le lien de réinitialisation est écrit dans les journaux de l'API en développement.
- **Construction Android sous Docker** (`make android`) : Dockerfile fourni mais non exécuté ici (l'APK a été construit avec le SDK local).

### Prérequis pour la production

Voir [docs/deployment.md](docs/deployment.md) : HTTPS et `COOKIE_SECURE=true`, secrets générés et stockés dans un gestionnaire de secrets, S3 managé avec chiffrement au repos, PostgreSQL managé avec sauvegardes, fournisseur e-mail transactionnel, supervision des erreurs (ex. Sentry), FCM pour le push, clé de signature Android et préparation Play Store, revue de sécurité indépendante, politique de confidentialité et conditions d'utilisation (dont l'information sur le traitement par un fournisseur d'IA).

## Documentation

- [Architecture](docs/architecture.md)
- [Synchronisation hors ligne](docs/offline-sync.md)
- [Sécurité et confidentialité](docs/security-privacy.md)
- [Intégration de l'IA](docs/ai-integration.md)
- [Déploiement et exploitation](docs/deployment.md)
- [Hébergement AWS (EC2) et installation sur téléphone](docs/deployment-aws.md)
- [Contrat d'API](shared/api-contracts/openapi.yaml)

L'identité visuelle s'inspire de la tradition éditoriale universitaire (cramoisi, ivoire, typographie à empattements). L'emblème (livre ouvert et étoile) est une création originale, sans lien avec une université existante.
