# Intégration de l'IA

## Couche indépendante du fournisseur

`backend/src/modules/ai/provider.ts` définit l'interface `AiProvider` (`summarize`, `flashcards`, `quiz`, `answer`). Implémentations :

| Fournisseur | Fichier | Usage |
|---|---|---|
| `mock` (défaut) | `mock.provider.ts` | **Sans modèle de langage.** Extraction de définitions, formules, exemples et phrases clés des sources ; quiz et cartes construits à partir de ces extraits ; tuteur qui cite les passages les plus pertinents. Ne produit aucune explication inventée. Toujours signalé « mode démonstration ». |
| `anthropic` | `anthropic.provider.ts` | SDK officiel `@anthropic-ai/sdk`, modèle `AI_MODEL` (défaut `claude-opus-5-5`), raisonnement adaptatif, `effort` configurable, sorties structurées JSON Schema, repli serveur en cas de refus (`AI_ENABLE_FALLBACKS`). Implémenté, non testé ici faute de clé. |

Ajouter un fournisseur : implémenter `AiProvider`, l'enregistrer dans `getProvider()` (`ai.service.ts`), ajouter sa valeur à `AI_PROVIDER` dans `config/env.ts`.

## Chaîne de traitement

1. **Portée** (`context.ts`) : la **base de connaissances** d'un dossier (tous ses documents : PDF, scans, textes collés), d'un sous-dossier (avec ses descendants) ou une sélection de documents ; à défaut, le contenu d'une leçon. Seules les ressources de l'utilisateur sont lues. Les documents non prêts sont signalés et ignorés.
2. **Passages** : passages extraits des documents (ou texte de la leçon pour la portée « leçon »), numérotés `S1…Sn` avec titre et page (page absente quand l'extraction ne la fournit pas, ex. Word — elle n'est jamais inventée). Au-delà de `AI_MAX_CONTEXT_CHARS`, sélection uniforme sur l'ensemble des sources et mention de la couverture partielle.
3. **Contenu insuffisant** : refus explicite (`INSUFFICIENT_CONTENT`) plutôt que génération à partir de rien.
4. **Génération** : consignes système (`prompts.ts`) : sources = données non fiables (aucune instruction qu'elles contiennent n'est suivie), citer uniquement les identifiants fournis, séparer les ajouts de l'IA (`additionalExplanations`, `generalKnowledgeUsed`), signaler l'incertitude, notation LaTeX, approche pédagogique (guider plutôt que donner la réponse).
5. **Validation** : schéma Zod sur chaque réponse ; pour les quiz, `validateQuestion` vérifie chaque clé de correction (indices valides, options distinctes, blanc présent, association bijective) — les questions incohérentes sont écartées et le nombre écarté est indiqué ; les citations inconnues sont supprimées (y compris les marqueurs `[Sx]` dans le texte).
6. **Provenance** : chaque élément de résumé, carte et question conserve ses références (`documentId`, `lessonId`, titre, page).

## Questions-réponses (RAG)

`retrieval.ts` : BM25 sur les passages autorisés (tokenisation insensible aux accents, mots vides FR/EN). Les 8 meilleurs passages sont transmis au fournisseur avec l'historique récent de la conversation. Pas d'embeddings vectoriels dans cette version : la recherche est locale, déterministe et gratuite ; un index vectoriel (pgvector) peut être ajouté derrière la même fonction.

## Coûts, quotas, pannes

- `AiUsage` : tâche, fournisseur, modèle, jetons, coût estimé, latence, succès / code d'erreur — également journalisé.
- Quota quotidien par utilisateur (`AI_DAILY_REQUEST_LIMIT`) + limitation de débit (10 / min).
- Erreurs du fournisseur converties en messages clairs : indisponible (503), saturé (429), refus (422), réponse tronquée ou mal formée (422 / 502). Les tests simulent une panne et une sortie invalide.
- Signalement d'un contenu incorrect : `POST /ai/feedback` (résumé, carte, question, message).

## Programme de révision

Le planificateur (`services/planner.ts`) est **déterministe**, sans IA : priorité = urgence de l'examen × faiblesse (confiance déclarée, résultats de quiz réels, cartes difficiles) × leçons restantes × importance, avec étalement entre matières. Il ne dépasse jamais la disponibilité quotidienne déclarée (déduction faite des sessions manuelles), propose un examen blanc dans les 2 jours précédant l'examen, et chaque session porte une raison lisible.
