#!/usr/bin/env bash
# One-time bootstrap of a fresh Ubuntu server for abzar/api.
# Run as root:  bash deploy/setup-server.sh <domain> <admin-email> [deploy-user]
#
# Installs: docker + compose plugin, nginx, certbot, ufw, fail2ban.
# Does NOT deploy the app — run deploy/deploy.sh afterwards.
set -euo pipefail

DOMAIN="${1:?usage: setup-server.sh <domain> <admin-email> [deploy-user]}"
EMAIL="${2:?usage: setup-server.sh <domain> <admin-email> [deploy-user]}"
DEPLOY_USER="${3:-deploy}"

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

log "System update"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg git ufw fail2ban

log "Deploy user: $DEPLOY_USER"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos '' "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"
# Carry root's authorized_keys over so you can SSH in as the deploy user.
if [ -f /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
    /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

log "Docker Engine + compose plugin"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
# shellcheck disable=SC1091
UBUNTU_CODENAME="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $UBUNTU_CODENAME stable" \
  >/etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker "$DEPLOY_USER"

log "Nginx + certbot"
apt-get install -y nginx certbot python3-certbot-nginx

log "Firewall (ufw): SSH + HTTP + HTTPS only"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

log "Swap (2G) — Mongo + the docker build need headroom on small VPSes"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

log "Nginx vhost for $DOMAIN"
sed -E "s/(server_name )[^;]+;/\1$DOMAIN;/" "$(dirname "$0")/nginx/abzar-api.conf" \
  >/etc/nginx/sites-available/abzar-api
ln -sf /etc/nginx/sites-available/abzar-api /etc/nginx/sites-enabled/abzar-api
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "TLS certificate (Let's Encrypt)"
echo "DNS for $DOMAIN must already point at this server — otherwise this step fails."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
systemctl enable --now certbot.timer

log "Done. Next:"
cat <<EOF
  1. su - $DEPLOY_USER
  2. git clone <repo-url> ~/abzar-api && cd ~/abzar-api
  3. cp deploy/env.production.example .env.production && \$EDITOR .env.production
  4. bash deploy/deploy.sh --seed
EOF
