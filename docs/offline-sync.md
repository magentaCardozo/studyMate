# Synchronisation hors ligne (Android)

## Principe

1. **Lecture locale** : tous les écrans Android lisent Room. L'application reste utilisable sans réseau.
2. **Écriture locale + file** : chaque modification met à jour Room puis ajoute une opération dans `pending_operations` (`opId` UUID, entité, action, identifiant, données, `baseUpdatedAt`, `clientTime`).
3. **Envoi** (`POST /api/v1/sync/push`) : opérations dans l'ordre de création, par lots de 100.
4. **Réception** (`GET /api/v1/sync/changes?since=<curseur>`) : toutes les ressources modifiées depuis le curseur, plus les **traces de suppression** (`Tombstone`). Le curseur est l'heure serveur renvoyée.

Déclencheurs : retour du réseau (`ConnectivityManager`), modification locale (`WorkManager` unique, contrainte réseau, recul exponentiel), toutes les heures (périodique), et bouton « Synchroniser maintenant ». WorkManager ne garantit pas une exécution immédiate : le bouton manuel existe pour cette raison.

## Identifiants et idempotence

- Les ressources créées hors ligne reçoivent un UUID local, accepté tel quel par le serveur.
- Chaque opération porte un `opId`. Le serveur enregistre les opérations appliquées (`SyncOperation`) : un renvoi (perte de réponse réseau) renvoie `duplicate` sans effet.
- Les révisions de cartes utilisent leur propre identifiant (`clientOpId`) : jamais comptées deux fois.

## Fusion des modifications locales

Les mises à jour successives d'une même ressource (sauvegarde automatique d'une note) sont **fusionnées** dans l'opération déjà en attente — dans le `create` s'il n'est pas encore envoyé, sinon dans le `update` précédent en conservant sa version de base. Si une modification arrive pendant l'envoi, le complément devient une nouvelle mise à jour basée sur la version serveur qui vient d'être reçue.

## Résolution des conflits

| Situation | Règle |
|---|---|
| Note modifiée sur le serveur depuis `baseUpdatedAt` | La version serveur est conservée **et** la version locale est enregistrée comme nouvelle note « (conflit) ». Rien n'est perdu ; l'étudiant est informé (écran Profil). |
| Leçon : changement de statut (terminée / en cours) | Toujours appliqué (fait local), avec l'heure locale de l'action. |
| Leçon, matière, carte : modification de contenu en conflit | La version serveur l'emporte ; l'étudiant est informé. |
| Révision de carte | Ajout pur, rejoué dans l'ordre ; l'algorithme SM-2 est identique sur l'appareil et le serveur. |
| Session d'étude (fait / passée) | Appliquée. |
| Ressource supprimée ailleurs | Supprimée localement à la réception de la trace. |
| Échec répété (5 tentatives) | L'opération reste en file, l'erreur est affichée ; elle n'est plus réessayée automatiquement. |

Lors de la réception, une ressource ayant encore une opération locale en attente n'est pas écrasée.

## Disponible hors ligne / en ligne uniquement

| Hors ligne | En ligne uniquement |
|---|---|
| Consultation des dossiers, sous-dossiers, leçons, agenda, examens | Génération IA (QCM, fiches, cartes), tuteur |
| Notes (création, modification, suppression) | Ajout à la base de connaissances (PDF, scan + OCR, texte collé) |
| Statut des leçons, sessions faites / passées | Téléchargement de documents |
| Étude des cartes (SM-2 local) | Quiz en mode examen (corrections non stockées sur l'appareil) |
| Quiz d'entraînement (correction locale, résultat conservé sur l'appareil) | Programme de révision, statistiques |
| Documents téléchargés et texte extrait mis en cache | Création de comptes, consentement IA |

Aucun modèle d'IA ne fonctionne sur l'appareil.

## Évolution du schéma local

Room v2 (base de connaissances par dossier) : la table `documents` perd le rattachement à une leçon et gagne `source`. La migration `MIGRATION_1_2` recopie les données sans perte ; la file des modifications en attente est conservée.

## Web

Le web n'a pas de bibliothèque hors ligne. Il signale la perte de connexion et conserve localement les réponses d'une tentative de quiz en cours (`localStorage`), renvoyées au retour du réseau.
