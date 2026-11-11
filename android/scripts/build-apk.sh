#!/usr/bin/env bash
# Construit l'APK diffusé (android/dist/studymate.apk) et son manifeste de mise à jour
# (android/dist/version.json), publiés ensemble par infrastructure/deployment/aws/deploy.sh.
#
#   ./android/scripts/build-apk.sh                         # adresse du serveur lue dans aws/.state
#   ./android/scripts/build-apk.sh https://domaine/ "Nouveautés : thème sombre"
#
# Le numéro de version (versionCode) est le nombre de minutes écoulées depuis le 1er janvier 2026 :
# il augmente à chaque construction, ce qui permet aux applications installées de détecter la mise à jour.
# Les mises à jour ne s'installent que si l'APK est signé avec la même clé que la version installée.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$ROOT/infrastructure/deployment/aws/.state"
API_URL="${1:-}"
if [ -z "$API_URL" ] && [ -f "$STATE" ]; then
  API_URL="https://$(grep '^DOMAIN=' "$STATE" | cut -d= -f2)/"
fi
[ -n "$API_URL" ] || { echo "Adresse du serveur introuvable : passez-la en argument (https://…/)." >&2; exit 1; }
NOTES="${2:-${RELEASE_NOTES:-}}"

VERSION_CODE=$(( ($(date -u +%s) - 1767225600) / 60 ))
VERSION_NAME="$(date -u +%Y.%m.%d)-$(date -u +%H%M)"

echo "▸ Construction de StudyMate AI $VERSION_NAME (code $VERSION_CODE) pour $API_URL"
cd "$ROOT/android"
./gradlew -q :app:assembleDebug \
  -Pstudymate.apiUrl="$API_URL" \
  -Pstudymate.versionCode="$VERSION_CODE" \
  -Pstudymate.versionName="$VERSION_NAME"

mkdir -p dist
cp app/build/outputs/apk/debug/app-debug.apk dist/studymate.apk
SHA256=$(shasum -a 256 dist/studymate.apk | cut -d' ' -f1)
SIZE=$(wc -c < dist/studymate.apk | tr -d ' ')

VERSION_CODE="$VERSION_CODE" VERSION_NAME="$VERSION_NAME" SHA256="$SHA256" SIZE="$SIZE" NOTES="$NOTES" python3 - <<'PY'
import json, os, datetime
manifest = {
    "versionCode": int(os.environ["VERSION_CODE"]),
    "versionName": os.environ["VERSION_NAME"],
    "apkUrl": "studymate.apk",
    "sha256": os.environ["SHA256"],
    "size": int(os.environ["SIZE"]),
    "notes": os.environ["NOTES"] or None,
    "releasedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
}
with open("dist/version.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
PY
echo "▸ android/dist/studymate.apk ($SIZE octets) et android/dist/version.json prêts."
