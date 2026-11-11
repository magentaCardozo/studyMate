# Hébergement AWS (environnement de test)

## Architecture

```
Téléphone / navigateur ──HTTPS──► IP élastique ──► EC2 t4g.medium (Ubuntu 24.04 ARM, us-east-1)
                                                  ├─ Caddy : TLS Let's Encrypt automatique, seul exposé (80/443)
                                                  ├─ web (nginx) ─► api (Express) + worker (OCR, rappels)
                                                  └─ PostgreSQL 16 (volume Docker sur EBS gp3 chiffré)
                                                           │  rôle IAM d'instance (aucune clé stockée)
                                                           ▼
                                  S3 privé chiffré « studymate-data-<compte>-<région> »
                                  ├─ users/     documents (versionnés)
                                  ├─ backups/   pg_dump quotidien (30 jours)
                                  └─ releases/  versions du code et APK (90 jours)
Administration : AWS Systems Manager (Session Manager / Run Command) — aucun port SSH ouvert.
```

Choix et sécurité :

| Élément | Choix |
|---|---|
| Réseau | Groupe de sécurité dédié `studymate-web-sg` : 80 et 443 uniquement. Pas de SSH (SSM). |
| Instance | IMDSv2 obligatoire (limite de saut 2 pour les conteneurs), disque chiffré, mises à jour de sécurité automatiques, 2 Go de swap. |
| Secrets | Générés **sur le serveur** au premier déploiement (`/opt/studymate/.env.prod`, droits 600) ; jamais envoyés depuis le poste. |
| Documents | Amazon S3 : accès public bloqué, chiffrement SSE, versionnement, HTTPS obligatoire (politique de bucket). Le rôle IAM n'accède qu'à ce bucket et à ses préfixes. |
| HTTPS | Caddy obtient et renouvelle le certificat. Adresse automatique `studymate.<ip-avec-tirets>.sslip.io` (aucun DNS à gérer). |
| Isolement | Toutes les ressources sont nommées `studymate-*` et taguées `Project=studymate` ; rien d'existant n'est modifié. |

Coût indicatif : instance ≈ 25 $/mois, disque 30 Go ≈ 2,4 $, IPv4 publique ≈ 3,6 $, S3 négligeable → **≈ 30 $/mois**. Arrêter l'instance (`aws ec2 stop-instances`) réduit le coût au disque et à l'IP.

## Scripts (`infrastructure/deployment/aws/`)

Prérequis : AWS CLI configurée, `jq`.

```bash
./infrastructure/deployment/aws/provision.sh   # crée (ou complète) l'infrastructure — idempotent
./infrastructure/deployment/aws/deploy.sh      # envoie le code (et l'APK) puis reconstruit sur le serveur
./infrastructure/deployment/aws/destroy.sh     # supprime l'environnement (KEEP_DATA=0 pour supprimer aussi le bucket)
```

L'état (identifiants, IP, adresse) est écrit dans `infrastructure/deployment/aws/.state` (non versionné).

### Mettre à jour l'application

```bash
./android/scripts/build-apk.sh "" "Nouveautés de cette version (affichées sur le téléphone)"
./infrastructure/deployment/aws/deploy.sh
```

`build-apk.sh` lit l'adresse du serveur dans `aws/.state` et donne à l'APK un numéro de version croissant : le nombre de minutes depuis le 1er janvier 2026. Il écrit aussi `android/dist/version.json`, qui contient ce numéro, l'empreinte SHA-256, la taille et les notes. `deploy.sh` publie les deux fichiers dans `/telecharger/`, l'APK d'abord, le manifeste ensuite.

**Mises à jour sur les téléphones :** l'application consulte `https://<adresse>/telecharger/version.json` au lancement et à chaque retour au premier plan, ainsi que depuis Profil › « Rechercher une mise à jour ». Quand une version plus récente existe, elle propose « Mettre à jour ». Elle télécharge alors l'APK, vérifie sa taille et son empreinte, puis ouvre l'installateur d'Android. La première fois, Android demande d'autoriser StudyMate AI à installer des applications. Les données de l'application sont conservées.

> Une mise à jour ne s'installe que si l'APK est signé avec **la même clé** que la version installée. L'APK de test est signé avec la clé de débogage de la machine qui le construit (`~/.android/debug.keystore`) : il faut toujours le construire sur la même machine, ou conserver cette clé. Pour une vraie diffusion, il faut une clé de signature dédiée, sauvegardée.

La version précédente reste dans `/opt/studymate/app.prev` sur le serveur (retour arrière : la remettre en place puis relancer `docker compose … up -d`).

### Administrer le serveur

```bash
aws ssm start-session --target <instance-id>          # shell sur le serveur (plugin Session Manager requis)
sudo docker compose -f /opt/studymate/app/infrastructure/deployment/docker-compose.prod.yml --env-file /opt/studymate/.env.prod logs -f api worker
sudo /usr/local/bin/studymate-backup                  # sauvegarde manuelle vers S3
```

### Activer l'IA Claude

Sur le serveur, ajouter dans `/opt/studymate/.env.prod` : `AI_PROVIDER=anthropic` et `ANTHROPIC_API_KEY=…`, puis relancer `docker compose … up -d`. Ne jamais mettre la clé dans le dépôt ni dans l'application mobile.

### Restaurer une sauvegarde

```bash
aws s3 cp s3://<bucket>/backups/<fichier>.dump /tmp/restore.dump
sudo docker exec -i studymate-db-1 pg_restore -U studymate -d studymate --clean --if-exists < /tmp/restore.dump
```

## Installer l'application sur un téléphone Android

1. Sur le téléphone, ouvrir `https://<adresse>/telecharger/studymate.apk` (ou transférer le fichier `android/dist/studymate.apk`).
2. Autoriser l'installation depuis cette source quand Android le demande (« Installer des applications inconnues »).
3. Ouvrir StudyMate AI, créer un compte (ou se connecter avec un compte créé sur le web).

Il s'agit d'une **version de test** (APK de débogage signé avec la clé de développement) : Play Protect peut afficher un avertissement. Pour une diffusion réelle : clé de signature dédiée, `assembleRelease`/bundle AAB et publication via la Play Console.

## Avant une vraie production

Nom de domaine propre, compte IAM dédié (ne pas utiliser l'utilisateur root), base PostgreSQL managée (RDS, sauvegardes PITR) ou au minimum instantanés EBS, alarmes CloudWatch (CPU, disque, santé), collecte des erreurs, service e-mail (SES) pour la réinitialisation des mots de passe, WAF/limitation en frontal, revue de sécurité.
