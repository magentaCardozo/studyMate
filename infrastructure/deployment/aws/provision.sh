#!/usr/bin/env bash
# StudyMate AI — provisionnement AWS (EC2 + S3 + IAM + IP fixe), idempotent.
#
#   ./infrastructure/deployment/aws/provision.sh
#
# Crée uniquement des ressources nommées « studymate-* » et taguées Project=studymate :
#   - bucket S3 privé (chiffré, versionné, accès public bloqué) : documents, sauvegardes, versions ;
#   - rôle IAM d'instance : accès limité à ce bucket + SSM (administration sans SSH) ;
#   - groupe de sécurité : 80/443 uniquement (aucun port SSH) ;
#   - instance EC2 Ubuntu 24.04 ARM (t4g.medium), disque gp3 chiffré, IMDSv2 obligatoire ;
#   - adresse IP élastique dédiée.
# L'état est écrit dans infrastructure/deployment/aws/.state (non versionné).
set -euo pipefail
export AWS_PAGER=""

REGION="${AWS_REGION:-us-east-1}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.medium}"
DISK_GB="${DISK_GB:-30}"
NAME="studymate"
HERE="$(cd "$(dirname "$0")" && pwd)"
STATE="$HERE/.state"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${NAME}-data-${ACCOUNT}-${REGION}"
ROLE="${NAME}-ec2-role"
TAGS="Key=Project,Value=${NAME}"

log() { printf '\033[1;31m▸\033[0m %s\n' "$*"; }

# ── S3 ────────────────────────────────────────────────────────────────────────
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  log "Création du bucket privé $BUCKET"
  if [ "$REGION" = "us-east-1" ]; then aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
  else aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION" >/dev/null; fi
fi
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api put-bucket-tagging --bucket "$BUCKET" --tagging "TagSet=[{Key=Project,Value=${NAME}}]"
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{
  "Rules": [
    {"ID":"sauvegardes-30-jours","Status":"Enabled","Filter":{"Prefix":"backups/"},"Expiration":{"Days":30},"NoncurrentVersionExpiration":{"NoncurrentDays":7}},
    {"ID":"versions-90-jours","Status":"Enabled","Filter":{"Prefix":"releases/"},"Expiration":{"Days":90},"NoncurrentVersionExpiration":{"NoncurrentDays":7}},
    {"ID":"anciennes-versions-documents","Status":"Enabled","Filter":{"Prefix":"users/"},"NoncurrentVersionExpiration":{"NoncurrentDays":30}}
  ]}'
# Refus de tout accès non chiffré (HTTPS obligatoire).
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[{\"Sid\":\"HttpsOnly\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",
    \"Resource\":[\"arn:aws:s3:::${BUCKET}\",\"arn:aws:s3:::${BUCKET}/*\"],
    \"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"

# ── IAM ───────────────────────────────────────────────────────────────────────
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  log "Création du rôle IAM $ROLE"
  aws iam create-role --role-name "$ROLE" --tags "$TAGS" --assume-role-policy-document '{
    "Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
fi
aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --role-name "$ROLE" --policy-name "${NAME}-s3-bucket" --policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[
    {\"Sid\":\"ListBucket\",\"Effect\":\"Allow\",\"Action\":[\"s3:ListBucket\",\"s3:GetBucketLocation\"],\"Resource\":\"arn:aws:s3:::${BUCKET}\"},
    {\"Sid\":\"Documents\",\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\"],\"Resource\":[\"arn:aws:s3:::${BUCKET}/users/*\"]},
    {\"Sid\":\"Backups\",\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\",\"s3:GetObject\"],\"Resource\":[\"arn:aws:s3:::${BUCKET}/backups/*\"]},
    {\"Sid\":\"Releases\",\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\"],\"Resource\":[\"arn:aws:s3:::${BUCKET}/releases/*\"]}
  ]}"
if ! aws iam get-instance-profile --instance-profile-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$ROLE" --tags "$TAGS" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
  log "Attente de la propagation IAM…"; sleep 15
fi

# ── Réseau ────────────────────────────────────────────────────────────────────
VPC_ID="$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
SG_ID="$(aws ec2 describe-security-groups --region "$REGION" --filters Name=group-name,Values=${NAME}-web-sg Name=vpc-id,Values="$VPC_ID" --query 'SecurityGroups[0].GroupId' --output text)"
if [ "$SG_ID" = "None" ]; then
  log "Création du groupe de sécurité ${NAME}-web-sg (80/443 seulement)"
  SG_ID="$(aws ec2 create-security-group --region "$REGION" --group-name ${NAME}-web-sg --description 'StudyMate AI - HTTP/HTTPS uniquement (admin via SSM)' --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=security-group,Tags=[{$TAGS},{Key=Name,Value=${NAME}-web-sg}]" --query GroupId --output text)"
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" --ip-permissions \
    'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTP (redirection + Lets Encrypt)}],Ipv6Ranges=[{CidrIpv6=::/0}]' \
    'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTPS}],Ipv6Ranges=[{CidrIpv6=::/0}]' >/dev/null
fi

# ── Instance ──────────────────────────────────────────────────────────────────
INSTANCE_ID="$(aws ec2 describe-instances --region "$REGION" --filters Name=tag:Name,Values=${NAME}-server Name=instance-state-name,Values=pending,running,stopping,stopped --query 'Reservations[0].Instances[0].InstanceId' --output text)"
if [ "$INSTANCE_ID" = "None" ]; then
  AMI="$(aws ssm get-parameter --region "$REGION" --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text)"
  log "Lancement de l'instance $INSTANCE_TYPE (AMI $AMI)"
  INSTANCE_ID="$(aws ec2 run-instances --region "$REGION" --image-id "$AMI" --instance-type "$INSTANCE_TYPE" \
    --iam-instance-profile Name="$ROLE" --security-group-ids "$SG_ID" \
    --metadata-options HttpTokens=required,HttpPutResponseHopLimit=2,HttpEndpoint=enabled \
    --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=${DISK_GB},VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}" \
    --user-data "file://$HERE/user-data.sh" \
    --tag-specifications "ResourceType=instance,Tags=[{$TAGS},{Key=Name,Value=${NAME}-server}]" "ResourceType=volume,Tags=[{$TAGS},{Key=Name,Value=${NAME}-root}]" \
    --query 'Instances[0].InstanceId' --output text)"
  aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"
fi

# ── IP fixe ───────────────────────────────────────────────────────────────────
ALLOC_ID="$(aws ec2 describe-addresses --region "$REGION" --filters Name=tag:Name,Values=${NAME}-eip --query 'Addresses[0].AllocationId' --output text)"
if [ "$ALLOC_ID" = "None" ]; then
  log "Réservation d'une adresse IP élastique dédiée"
  ALLOC_ID="$(aws ec2 allocate-address --region "$REGION" --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{$TAGS},{Key=Name,Value=${NAME}-eip}]" --query AllocationId --output text)"
fi
aws ec2 associate-address --region "$REGION" --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" >/dev/null
PUBLIC_IP="$(aws ec2 describe-addresses --region "$REGION" --allocation-ids "$ALLOC_ID" --query 'Addresses[0].PublicIp' --output text)"
DOMAIN="${DOMAIN:-${NAME}.$(echo "$PUBLIC_IP" | tr . -).sslip.io}"

cat > "$STATE" <<EOF
REGION=$REGION
BUCKET=$BUCKET
INSTANCE_ID=$INSTANCE_ID
SG_ID=$SG_ID
ALLOC_ID=$ALLOC_ID
PUBLIC_IP=$PUBLIC_IP
DOMAIN=$DOMAIN
EOF
log "Prêt : instance $INSTANCE_ID — IP $PUBLIC_IP — https://$DOMAIN"
log "Étape suivante : ./infrastructure/deployment/aws/deploy.sh"
