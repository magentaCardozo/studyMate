#!/bin/bash
# Premier démarrage de l'instance : Docker, AWS CLI, mises à jour de sécurité automatiques, swap.
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg unattended-upgrades jq
# Mises à jour de sécurité automatiques
dpkg-reconfigure -f noninteractive unattended-upgrades

# Docker (dépôt officiel)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# Rotation des journaux Docker
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
systemctl restart docker

# AWS CLI (téléchargement des versions, sauvegardes vers S3)
snap install aws-cli --classic

# 2 Go de swap : confort pour les builds Docker sur 4 Go de RAM
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p /opt/studymate
touch /var/lib/studymate-bootstrap-done
