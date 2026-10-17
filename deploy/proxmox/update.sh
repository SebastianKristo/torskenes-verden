#!/usr/bin/env bash
# Oppdaterer «OS» i en eksisterende LXC uten git. Kjør på Proxmox-verten som root:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/update.sh)"
# Velg container med CTID=106 hvis den ikke finnes automatisk. .env og data/ i containeren røres ikke.
set -euo pipefail

BRANCH="${BRANCH:-main}"
URL="https://codeload.github.com/SebastianKristo/torskenes-verden/tar.gz/refs/heads/$BRANCH"
c() { printf '\e[1;34m%s\e[0m\n' "$*"; }
die() { printf '\e[1;31m%s\e[0m\n' "$*" >&2; exit 1; }

command -v pct >/dev/null || die "Dette må kjøres på en Proxmox VE-vert."

if [ -z "${CTID:-}" ]; then
  CTID=$(pct list | awk 'NR>1 && $NF=="homelab-os" {print $1; exit}')
  [ -n "$CTID" ] || die "Fant ingen container med navnet homelab-os. Kjør med CTID=<id> (se 'pct list')."
fi
pct status "$CTID" | grep -q running || pct start "$CTID"
pct exec "$CTID" -- test -f /opt/homelab-os/docker-compose.yml || die "Fant ikke /opt/homelab-os i container $CTID."

c "Laster ned siste versjon ($BRANCH) …"
TMP=$(mktemp --suffix=.tgz)
trap 'rm -f "$TMP"' EXIT
curl -fsSL "$URL" -o "$TMP" || die "Nedlasting feilet. Er repoet offentlig?"

c "Kopierer inn i container $CTID …"
pct push "$CTID" "$TMP" /tmp/os.tgz
# Arkivet har én toppmappe (repo-branch/); den fjernes. .env og data/ finnes ikke i arkivet og beholdes.
pct exec "$CTID" -- bash -c "tar -xzf /tmp/os.tgz -C /opt/homelab-os --strip-components=1 && rm /tmp/os.tgz"

c "Bygger og starter på nytt …"
PROFILE=""
pct exec "$CTID" -- grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=.+' /opt/homelab-os/.env && PROFILE="--profile tunnel"
pct exec "$CTID" -- bash -c "cd /opt/homelab-os && docker compose $PROFILE up -d --build && docker image prune -f >/dev/null"

c "Ferdig! Container $CTID kjører nyeste versjon."
