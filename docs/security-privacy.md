# Sécurité et confidentialité

## Authentification

- Mots de passe hachés (bcrypt, coût 12) ; comparaison à temps homogène même pour un compte inexistant.
- Jeton d'accès JWT 15 min (émetteur / audience vérifiés). Jeton de rafraîchissement opaque (48 octets aléatoires), stocké haché (SHA-256), 30 jours, **à usage unique** : chaque rafraîchissement le remplace. Réutiliser un ancien jeton révoque toute la famille (vol présumé) et est journalisé.
- Web : cookies `HttpOnly`, `SameSite=Strict`, `Secure` en production (`COOKIE_SECURE=true`), chemin restreint pour le jeton de rafraîchissement. Les requêtes modifiantes authentifiées par cookie exigent `X-Requested-With: StudyMate` (protection CSRF supplémentaire). Le web et l'API partagent la même origine (nginx).
- Android : jetons dans le corps des réponses, chiffrés AES-GCM par une clé non exportable de l'Android Keystore. Sauvegarde cloud désactivée. Déconnexion = révocation serveur + effacement de la base locale et des fichiers.
- Changement de mot de passe : toutes les sessions sont révoquées. Réinitialisation : jeton à usage unique, 1 h, réponse identique que le compte existe ou non.
- Limitation de débit : authentification (30 / 15 min / IP), API (300 / min), IA (10 / min / utilisateur) + quota quotidien.

## Autorisation

Chaque route protégée passe par `requireAuth`, puis par les fonctions de `services/ownership.ts` : une ressource d'un autre étudiant renvoie **404** (son existence n'est pas révélée). Les emplacements (matière / dossier / leçon) sont vérifiés pour appartenir au même utilisateur et à la même matière. L'IA ne lit que les passages des documents de l'utilisateur courant. Les tests `security.test.ts` vérifient lecture, modification, suppression, déplacement, téléchargement et IA entre deux comptes.

## Fichiers

- Stockage S3 **privé** (non exposé hors du réseau Docker). Aucun lien public.
- Import : demande validée (extension + type déclaré + taille), URL signée à usage d'import (15 min) liée au document et à l'utilisateur, **vérification de la signature binaire** (un fichier « .pdf » qui n'est pas un PDF est refusé), taille réelle contrôlée.
- Téléchargement : URL signée de 5 min, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
- Les outils d'extraction s'exécutent dans le worker, sur des copies temporaires supprimées après usage.

## Validation et erreurs

Corps, paramètres et requêtes validés par Zod. Format d'erreur uniforme ; aucune pile d'appel en production. Le Markdown des notes est rendu sans HTML brut (protection XSS).

## Journal d'audit

`AuditLog` : inscription, connexion (réussie / échouée), déconnexions, détection de réutilisation de jeton, réinitialisation de mot de passe, consentement IA accordé / retiré, export et suppression de compte.

## Confidentialité

- Export complet des données (`GET /users/me/export`) et suppression définitive du compte et des fichiers (`DELETE /users/me`, mot de passe requis).
- **Consentement explicite** avant tout envoi de contenu à un fournisseur d'IA externe ; retrait possible à tout moment. Le mode démonstration n'envoie rien à l'extérieur.
- Les documents des étudiants ne servent pas à entraîner des modèles ; aucun partage public n'est proposé (respect des droits sur les supports de cours).
- Journaux : en-têtes `Authorization`, cookies et mots de passe masqués.
- Pas d'outil d'analyse tiers dans les clients.

## Points à compléter avant la production

Revue de sécurité / test d'intrusion indépendant, chiffrement au repos du stockage (S3 SSE-KMS) et de la base, rotation des secrets, analyse antivirus des fichiers importés, politique de rétention des journaux, en-tête CSP strict sur le web, épinglage de certificat éventuel sur Android.
