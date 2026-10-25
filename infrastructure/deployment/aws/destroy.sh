#!/usr/bin/env bash
# StudyMate AI — suppression de l'environnement AWS de test.
#   ./infrastructure/deployment/aws/destroy.sh            # supprime instance, IP, groupe de sécurité, rôle
#   KEEP_DATA=0 ./…/destroy.sh                            # supprime AUSSI le bucket (documents + sauvegardes)
# Ne touche qu'aux ressources « studymate-* » listées dans .state.
set -euo pipefail
export AWS_PAGER=""
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/.state"
read -r -p "Supprimer l'environnement StudyMate ($INSTANCE_ID, $PUBLIC_IP) ? Tapez « supprimer » : " OK
[ "$OK" = "supprimer" ] || { echo "Annulé."; exit 1; }

aws ec2 disassociate-address --region "$REGION" --public-ip "$PUBLIC_IP" 2>/dev/null || true
aws ec2 terminate-instances --region "$REGION" --instance-ids "$INSTANCE_ID" >/dev/null
aws ec2 wait instance-terminated --region "$REGION" --instance-ids "$INSTANCE_ID"
aws ec2 release-address --region "$REGION" --allocation-id "$ALLOC_ID"
aws ec2 delete-security-group --region "$REGION" --group-id "$SG_ID"
aws iam remove-role-from-instance-profile --instance-profile-name studymate-ec2-role --role-name studymate-ec2-role
aws iam delete-instance-profile --instance-profile-name studymate-ec2-role
aws iam detach-role-policy --role-name studymate-ec2-role --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam delete-role-policy --role-name studymate-ec2-role --policy-name studymate-s3-bucket
aws iam delete-role --role-name studymate-ec2-role
if [ "${KEEP_DATA:-1}" = "0" ]; then
  echo "Suppression du bucket $BUCKET (toutes versions)…"
  aws s3api delete-objects --bucket "$BUCKET" --delete "$(aws s3api list-object-versions --bucket "$BUCKET" --output json --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}')" >/dev/null 2>&1 || true
  aws s3api delete-objects --bucket "$BUCKET" --delete "$(aws s3api list-object-versions --bucket "$BUCKET" --output json --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}')" >/dev/null 2>&1 || true
  aws s3 rb "s3://$BUCKET"
else
  echo "Bucket conservé : $BUCKET (documents et sauvegardes)."
fi
rm -f "$HERE/.state"
echo "Environnement supprimé."
