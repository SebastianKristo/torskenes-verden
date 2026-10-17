#!/usr/bin/env bash
# Installerer «OS» i en ny Debian 12 LXC på Proxmox VE.
# Kjør på Proxmox-verten som root, fra en lokal kopi av repoet (anbefalt for privat repo):
#   git clone https://<TOKEN>@github.com/SebastianKristo/torskenes-verden.git && bash torskenes-verden/deploy/proxmox/install.sh
# Koden kopieres da rett inn i containeren. Uten lokal kopi klones REPO (sett GITHUB_TOKEN for private repo).
# Alle valg kan overstyres med miljøvariabler, f.eks. CTID=150 STORAGE=local-zfs bash install.sh
set -euo pipefail

REPO="${REPO:-https://github.com/SebastianKristo/torskenes-verden.git}"
BRANCH="${BRANCH:-main}"
CTID="${CTID:-$(pvesh get /cluster/nextid)}"
HOSTNAME="${CT_HOSTNAME:-homelab-os}"
STORAGE="${STORAGE:-}"            # tom = finn automatisk
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-}"
DISK="${DISK:-8}"
RAM="${RAM:-1024}"
CORES="${CORES:-2}"
BRIDGE="${BRIDGE:-vmbr0}"
IP="${IP:-dhcp}"            # eller f.eks. 192.168.1.60/24
GW="${GW:-}"                # påkrevd ved statisk IP
PORT="${PORT:-3000}"

c() { printf '\e[1;34m%s\e[0m\n' "$*"; }
die() { printf '\e[1;31m%s\e[0m\n' "$*" >&2; exit 1; }

command -v pct >/dev/null || die "Dette må kjøres på en Proxmox VE-vert."
[ "$(id -u)" = 0 ] || die "Kjør som root."

# Første aktive lagring som støtter innholdstypen (rootdir for disk, vztmpl for maler).
pick_storage() { pvesm status -content "$1" 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}'; }
storage_ok() { pvesm status -content "$2" 2>/dev/null | awk -v s="$1" 'NR>1 && $1==s {f=1} END {exit !f}'; }
[ -n "$STORAGE" ] || STORAGE=$(pick_storage rootdir)
[ -n "$TEMPLATE_STORAGE" ] || TEMPLATE_STORAGE=$(pick_storage vztmpl)
[ -n "$STORAGE" ] && storage_ok "$STORAGE" rootdir || die "Fant ingen lagring for containerdisker ('$STORAGE'). Se 'pvesm status -content rootdir' og sett STORAGE=..."
[ -n "$TEMPLATE_STORAGE" ] && storage_ok "$TEMPLATE_STORAGE" vztmpl || die "Fant ingen lagring for maler ('$TEMPLATE_STORAGE'). Aktiver 'Container template' på en lagring, eller sett TEMPLATE_STORAGE=..."
c "Lagring: disk på $STORAGE, mal på $TEMPLATE_STORAGE"

read -rsp "Passord for dashboardet (minst 8 tegn): " APP_PW; echo
[ ${#APP_PW} -ge 8 ] || die "Passordet er for kort."
read -rp "Cloudflare Tunnel-token (valgfritt, Enter for å hoppe over): " TUNNEL_TOKEN

c "Henter Debian 12-mal …"
pveam update >/dev/null
TEMPLATE=$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | sort -V | tail -1)
[ -n "$TEMPLATE" ] || die "Fant ingen Debian 12-mal."
pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE" || pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"

NET="name=eth0,bridge=$BRIDGE,ip=$IP"
[ "$IP" != dhcp ] && [ -n "$GW" ] && NET="$NET,gw=$GW"

c "Oppretter LXC $CTID ($HOSTNAME) …"
pct create "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" \
  --hostname "$HOSTNAME" --cores "$CORES" --memory "$RAM" --swap 512 \
  --rootfs "$STORAGE:$DISK" --net0 "$NET" \
  --unprivileged 1 --features nesting=1,keyctl=1 \
  --onboot 1 --timezone Europe/Oslo --ostype debian
pct start "$CTID"

c "Venter på nettverk …"
for _ in $(seq 1 30); do pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break; sleep 2; done

run() { pct exec "$CTID" -- bash -c "$1"; }

c "Installerer Docker og git …"
run "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl git openssl smbclient >/dev/null"
run "curl -fsSL https://get.docker.com | sh >/dev/null"

c "Henter koden og bygger …"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." 2>/dev/null && pwd || true)"
if [ -n "$SRC_DIR" ] && [ -f "$SRC_DIR/package.json" ] && [ -f "$SRC_DIR/server/index.js" ]; then
  TAR=$(mktemp --suffix=.tgz)
  tar -C "$SRC_DIR" --exclude=node_modules --exclude=data --exclude=.env -czf "$TAR" .
  pct push "$CTID" "$TAR" /tmp/src.tgz
  rm -f "$TAR"
  run "mkdir -p /opt/homelab-os && tar -xzf /tmp/src.tgz -C /opt/homelab-os && rm /tmp/src.tgz"
else
  URL="$REPO"
  [ -n "${GITHUB_TOKEN:-}" ] && URL="${REPO/https:\/\//https://x-access-token:$GITHUB_TOKEN@}"
  pct exec "$CTID" -- git clone --depth 1 -b "$BRANCH" "$URL" /opt/homelab-os \
    || die "Kunne ikke klone $REPO. Er repoet privat? Sett GITHUB_TOKEN eller kjør skriptet fra en lokal kopi."
  run "cd /opt/homelab-os && git remote set-url origin '$REPO'"
fi
run "cd /opt/homelab-os && docker compose build -q"

c "Lager .env …"
HASH=$(pct exec "$CTID" -- docker run --rm --entrypoint node homelab-os:local scripts/hash-password.js "$APP_PW" | sed 's/^APP_PASSWORD_HASH=//')
SECRET=$(openssl rand -hex 32)
TMP_ENV=$(mktemp)
pct exec "$CTID" -- cat /opt/homelab-os/.env.example \
  | grep -vE '^(APP_PASSWORD_HASH|SESSION_SECRET|CLOUDFLARE_TUNNEL_TOKEN|COOKIE_SECURE)=' > "$TMP_ENV"
{
  printf 'APP_PASSWORD_HASH=%s\n' "$HASH"
  printf 'SESSION_SECRET=%s\n' "$SECRET"
  printf 'CLOUDFLARE_TUNNEL_TOKEN=%s\n' "$TUNNEL_TOKEN"
  # Uten tunnel brukes vanlig http på LAN, så cookien kan ikke kreve HTTPS.
  if [ -n "$TUNNEL_TOKEN" ]; then echo COOKIE_SECURE=true; else echo COOKIE_SECURE=false; fi
  printf 'BIND_ADDR=0.0.0.0\nHOST_PORT=%s\n' "$PORT"
} >> "$TMP_ENV"
pct push "$CTID" "$TMP_ENV" /opt/homelab-os/.env --perms 600
rm -f "$TMP_ENV"

c "Starter …"
PROFILE=""; [ -n "$TUNNEL_TOKEN" ] && PROFILE="--profile tunnel"
run "cd /opt/homelab-os && docker compose $PROFILE up -d"

CT_IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')
c "Ferdig!"
echo "  Dashboard:     http://$CT_IP:$PORT"
echo "  Konfigurasjon: pct enter $CTID → nano /opt/homelab-os/.env → docker compose up -d"
echo "  Oppdatering:   se «Oppdatere Proxmox-installasjonen» i README"
