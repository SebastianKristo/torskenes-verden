#!/usr/bin/env bash
# Oppdaterer «OS» i en eksisterende LXC uten git. Kjør på Proxmox-verten som root:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SebastianKristo/torskenes-verden/main/deploy/proxmox/update.sh)"
# Velg container med CTID=106 hvis den ikke finnes automatisk. .env og data/ i containeren røres ikke.
set -euo pipefail

BRANCH="${BRANCH:-main}"
URL="https://codeload.github.com/SebastianKristo/torskenes-verden/tar.gz/refs/heads/$BRANCH"
c() { printf '\e[1;34m%s\e[0m\n' "$*"; }
die() { printf '\e[1;31m%s\e[0m\n' "$*" >&2; exit 1; }

# Prompt 51 (OPS51): backup-disk og NAS for restic (3-2-1). BACKUP_MP=/sti/på/verten → /srv/backup i os (BACKUP_DIR),
# NAS_MP=/mnt/pve/nas/nordlys → /mnt/nas/nordlys i os (velg stien som NAS-mål i Innstillinger → System → Backup).
# Monteres inn i LXC-en (pct set -mpN) og videre til os med docker-compose.override.yml (overlever oppdateringer).
add_mounts51() {
  [ -n "${BACKUP_MP:-}${NAS_MP:-}" ] || return 0
  local lines="" pair host ct n used changed=""
  for pair in "${BACKUP_MP:-}|/srv/backup" "${NAS_MP:-}|/mnt/nas/nordlys"; do
    host="${pair%%|*}"; ct="${pair##*|}"
    [ -n "$host" ] || continue
    case "$host" in /*) ;; *) die "Stien må være absolutt: $host" ;; esac
    if [ ! -d "$host" ]; then mkdir -p "$host" && chown 101000:101000 "$host"; fi   # uprivilegert LXC: PUID 1000 = 101000 på verten
    if ! pct config "$CTID" | grep -qE "^mp[0-9]+: ${host},mp=${ct}(,|$)"; then
      used=$(pct config "$CTID" | sed -n -E 's/^mp([0-9]+):.*/\1/p')
      for n in $(seq 0 9); do printf '%s\n' $used | grep -qx "$n" || break; done
      pct set "$CTID" -mp$n "$host,mp=$ct"; changed=1
      c "Monterte $host som $ct i container $CTID (mp$n)."
    fi
    lines="$lines      - $ct:$ct\n"
  done
  [ -n "$changed" ] && { pct reboot "$CTID" || { pct stop "$CTID" && pct start "$CTID"; }; for _ in $(seq 1 30); do pct exec "$CTID" -- true 2>/dev/null && break; sleep 2; done; }
  printf 'services:\n  os:\n    volumes:\n%b' "$lines" | pct exec "$CTID" -- bash -c 'cat > /opt/homelab-os/docker-compose.override.yml'
  if [ -n "${BACKUP_MP:-}" ]; then
    pct exec "$CTID" -- bash -c "grep -q '^BACKUP_DIR=' /opt/homelab-os/.env && sed -i 's|^BACKUP_DIR=.*|BACKUP_DIR=/srv/backup|' /opt/homelab-os/.env || echo BACKUP_DIR=/srv/backup >> /opt/homelab-os/.env"
  fi
  c "Backup-stiene er klare (docker-compose.override.yml). Velg mål i Innstillinger → System → Backup."
}

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

add_mounts51
c "Bygger og starter på nytt …"
PROFILE=""
pct exec "$CTID" -- grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=.+' /opt/homelab-os/.env && PROFILE="--profile tunnel"
# Compose kjøres fra prosjektmappen med PWD satt: updater-tjenesten monterer ${PWD} på samme sti som på verten.
# up -d --build starter også updater, så «Oppdater nå» i Innstillinger → System virker etter første kjøring.
pct exec "$CTID" -- bash -c "cd /opt/homelab-os && export PWD=/opt/homelab-os && docker compose $PROFILE up -d --build && docker image prune -f >/dev/null"

c "Ferdig! Container $CTID kjører nyeste versjon."
if pct exec "$CTID" -- bash -c "cd /opt/homelab-os && docker compose ps --status running --services 2>/dev/null | grep -qx updater"; then
  echo "  Oppdatering fra appen er slått på: Innstillinger → System → Oppdatering."
else
  echo "  Updater-tjenesten kjører ikke, så oppdatering fra appen er ikke tilgjengelig. Se: docker compose logs updater"
fi
