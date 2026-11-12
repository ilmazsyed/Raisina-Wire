#!/bin/bash
# One-time setup of the stream server on an Oracle Cloud Always Free Ubuntu machine (Ampere A1).
# Run inside the streamer folder:  sudo bash setup.sh
# It installs Docker, opens the web ports in the machine's own firewall, and starts the streams
# (after you have filled in .env).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo bash setup.sh"; exit 1; }
cd "$(dirname "$0")"

if ! command -v docker >/dev/null; then
  apt-get update -q
  apt-get install -y -q ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# Oracle's Ubuntu images block everything but SSH in iptables: open 80 and 443 (for HTTPS).
for port in 80 443; do
  iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then netfilter-persistent save; fi

[ -f .env ] || { cp .env.example .env; echo "Now fill in .env (nano .env), then run: sudo bash setup.sh"; exit 0; }
grep -qE '^KEY_H=.+' .env && grep -qE '^KEY_V=.+' .env && grep -qE '^DOMAIN=.+' .env && grep -qE '^FEED_SECRET=.+' .env \
  || { echo "Fill in KEY_H, KEY_V, DOMAIN and FEED_SECRET in .env first (nano .env)."; exit 1; }
chmod 600 .env

docker compose up -d --build
set -a; . ./.env; set +a
echo
echo "Started. In a minute or two the streams are at:"
echo "  Horizontal: https://$DOMAIN/$FEED_SECRET/h/index.m3u8"
echo "  Vertical:   https://$DOMAIN/$FEED_SECRET/v/index.m3u8"
echo "Check with: docker compose ps   and   docker compose logs -f capture-h"
