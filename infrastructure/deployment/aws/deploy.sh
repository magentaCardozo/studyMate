#!/usr/bin/env bash
# StudyMate AI — déploiement / mise à jour sur l'instance EC2 (via S3 + SSM, sans SSH).
#
#   ./infrastructure/deployment/aws/deploy.sh            # code + APK (si android/dist/studymate.apk existe)
#
# 1. empaquette le dépôt (sans node_modules, builds, secrets) et l'envoie dans s3://<bucket>/releases/ ;
# 2. demande à l'instance (SSM) de le récupérer, de générer .env.prod au premier déploiement
#    (les secrets sont créés SUR le serveur et n'en sortent pas), puis de reconstruire et relancer ;
# 3. installe la sauvegarde quotidienne de PostgreSQL vers S3.
set -euo pipefail
export AWS_PAGER=""
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
# shellcheck disable=SC1091
source "$HERE/.state"
TS="$(date -u +%Y%m%d-%H%M%S)"
KEY="releases/studymate-$TS.tar.gz"
TMP="$(mktemp -d)"

echo "▸ Empaquetage du dépôt"
COPYFILE_DISABLE=1 tar --no-xattrs -C "$ROOT" -czf "$TMP/release.tar.gz" \
  --exclude='./.git' --exclude='*/node_modules' --exclude='./backend/dist' --exclude='./web/dist' \
  --exclude='./android/.gradle' --exclude='./android/build' --exclude='./android/app/build' --exclude='./android/local.properties' \
  --exclude='./.env' --exclude='./.env.*' --exclude='./infrastructure/deployment/aws/.state' \
  .
aws s3 cp "$TMP/release.tar.gz" "s3://$BUCKET/$KEY" --region "$REGION" --only-show-errors
if [ -f "$ROOT/android/dist/studymate.apk" ]; then
  aws s3 cp "$ROOT/android/dist/studymate.apk" "s3://$BUCKET/releases/studymate.apk" --region "$REGION" --only-show-errors
  # Manifeste de mise à jour (android/scripts/build-apk.sh) : les applications installées le consultent.
  if [ -f "$ROOT/android/dist/version.json" ]; then
    aws s3 cp "$ROOT/android/dist/version.json" "s3://$BUCKET/releases/version.json" --region "$REGION" --only-show-errors --content-type application/json
  fi
fi
rm -rf "$TMP"

echo "▸ Attente de l'agent SSM et de l'initialisation de l'instance"
for _ in $(seq 1 60); do
  STATUS="$(aws ssm describe-instance-information --region "$REGION" --filters Key=InstanceIds,Values="$INSTANCE_ID" --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)"
  [ "$STATUS" = "Online" ] && break
  sleep 10
done
[ "$STATUS" = "Online" ] || { echo "L'instance n'est pas joignable par SSM."; exit 1; }

REMOTE=$(cat <<EOF
set -euo pipefail
for i in \$(seq 1 90); do [ -f /var/lib/studymate-bootstrap-done ] && break; sleep 10; done
[ -f /var/lib/studymate-bootstrap-done ] || { echo 'Initialisation non terminée'; exit 1; }
export PATH=\$PATH:/snap/bin
cd /opt/studymate
aws s3 cp s3://$BUCKET/$KEY /tmp/release.tar.gz --region $REGION --only-show-errors
mkdir -p app.new && tar -xzf /tmp/release.tar.gz -C app.new && rm /tmp/release.tar.gz
rm -rf app.prev && { [ -d app ] && mv app app.prev || true; } && mv app.new app
mkdir -p app/infrastructure/deployment/downloads
aws s3 cp s3://$BUCKET/releases/studymate.apk app/infrastructure/deployment/downloads/studymate.apk --region $REGION --only-show-errors || true
# Le manifeste n'est publié qu'après l'APK : une application ne voit jamais une version absente.
aws s3 cp s3://$BUCKET/releases/version.json app/infrastructure/deployment/downloads/version.json --region $REGION --only-show-errors || true

# Secrets générés une seule fois sur le serveur (conservés hors du répertoire de code).
if [ ! -f /opt/studymate/.env.prod ]; then
  umask 077
  cat > /opt/studymate/.env.prod <<ENV
DOMAIN=$DOMAIN
AWS_REGION=$REGION
S3_BUCKET=$BUCKET
POSTGRES_USER=studymate
POSTGRES_DB=studymate
POSTGRES_PASSWORD=\$(openssl rand -hex 24)
JWT_ACCESS_SECRET=\$(openssl rand -base64 48 | tr -d '\n/+=')
FILE_TOKEN_SECRET=\$(openssl rand -base64 48 | tr -d '\n/+=')
AI_PROVIDER=mock
ENV
fi

cd app
docker compose -f infrastructure/deployment/docker-compose.prod.yml --env-file /opt/studymate/.env.prod up -d --build --remove-orphans
# Caddy monte des fichiers du répertoire de version : on le recrée pour pointer vers la nouvelle version
# (le certificat est conservé dans le volume caddy_data).
docker compose -f infrastructure/deployment/docker-compose.prod.yml --env-file /opt/studymate/.env.prod up -d --no-deps --force-recreate caddy
docker image prune -f >/dev/null

# Sauvegarde quotidienne de la base vers S3 (03:15 UTC), conservée 30 jours (cycle de vie du bucket).
cat > /usr/local/bin/studymate-backup <<'BK'
#!/bin/bash
set -euo pipefail
export PATH=\$PATH:/snap/bin
source /opt/studymate/.env.prod
F=/tmp/studymate-\$(date -u +%Y%m%d-%H%M).dump
docker exec studymate-db-1 pg_dump -U "\$POSTGRES_USER" -d "\$POSTGRES_DB" -Fc > "\$F"
aws s3 cp "\$F" "s3://\$S3_BUCKET/backups/\$(basename "\$F")" --region "\$AWS_REGION" --only-show-errors
rm -f "\$F"
BK
chmod 750 /usr/local/bin/studymate-backup
echo '15 3 * * * root /usr/local/bin/studymate-backup >> /var/log/studymate-backup.log 2>&1' > /etc/cron.d/studymate-backup

sleep 20
docker compose -f infrastructure/deployment/docker-compose.prod.yml --env-file /opt/studymate/.env.prod ps --format '{{.Name}} {{.Status}}'
EOF
)

echo "▸ Déploiement sur $INSTANCE_ID (construction des images : quelques minutes)"
# Le script est transmis encodé et exécuté avec bash (le shell par défaut de SSM est sh/dash).
B64="$(printf '%s' "$REMOTE" | base64 | tr -d '\n')"
PARAMS="$(jq -n --arg b "$B64" '{commands: ["echo \($b) | base64 -d > /tmp/studymate-deploy.sh", "bash /tmp/studymate-deploy.sh"], executionTimeout: ["3600"]}')"
CMD_ID="$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript \
  --comment "StudyMate deploy $TS" --parameters "$PARAMS" --timeout-seconds 3600 --query Command.CommandId --output text)"
while true; do
  S="$(aws ssm get-command-invocation --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --query Status --output text 2>/dev/null || echo Pending)"
  case "$S" in Success|Failed|Cancelled|TimedOut) break ;; esac
  sleep 15
done
aws ssm get-command-invocation --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --query '[StandardOutputContent,StandardErrorContent]' --output text | tail -40
[ "$S" = "Success" ] || { echo "Échec du déploiement ($S)"; exit 1; }
echo "▸ En ligne : https://$DOMAIN   —   APK : https://$DOMAIN/telecharger/studymate.apk   —   version : https://$DOMAIN/telecharger/version.json"
