#!/usr/bin/env bash
# Updater for Homelab OS: gjør «Oppdater nå» i Innstillinger → System til en oppdatering, akkurat som update.sh.
#
# Kjører i sin egen container med Docker-socketen (= root i LXC-en). Derfor:
# - Ingen nettverksport. Den leser bare data/update/request.json, og bare feltene «id» og «action» brukes (validert).
#   action er 'update' (standard) eller 'rollback'. Ved rollback laster updateren ned forrige vellykkede sha fra sin
#   egen historikk (data/update/history.json, skrevet bare her) – serveren sender aldri sha, repo eller kommando.
#   Databasen gjenopprettes IKKE ved rollback (data-migreringer går fremover); forhåndsbackupen ligger i data/backups/.
# - Prompt 44: «Tidligere versjoner». Updateren eier versjonslista selv: data/update/versions.json (skrevet bare her) =
#   versjonene den selv har installert (history.json) + taggene den selv har lest fra GitHub (eget repo fra miljøet).
#   En rollback kan ha target:'<x.y.z>' – den MÅ finnes i denne lista og være semver, ellers avvises forespørselen.
#   restoreBackup:true gjenoppretter databasen fra backupen serveren tok rett før oppdateringen BORT FRA målversjonen
#   (data/backups/update-backups.json, oppføringen med fromVersion = target; filnavnet valideres). Den nåværende databasen kopieres først til
#   data/backups/pre-rollback-*.db. Ingen sti, sha, repo eller kommando leses fra forespørselen.
# - Svarer ikke den nye versjonen innen HEALTH_TIMEOUT (90 s), går updateren automatisk tilbake til versjonen den kom fra.
# - Repo og branch kommer KUN fra egne miljøvariabler (UPDATE_REPO, UPDATE_BRANCH), aldri fra forespørselen.
# - .env, data/ og proton/ i prosjektmappen røres aldri.
# - Prosjektmappen er montert på samme sti som på verten (HOST_DIR), så ./data-stiene compose gir Docker stemmer.
#
# Miljø: HOST_DIR (påkrevd), UPDATE_REPO, UPDATE_BRANCH, COMPOSE_PROJECT_NAME. For tester: ONCE=1 (én runde),
# HEALTH_URL, HEALTH_TIMEOUT, HEALTH_SLEEP, INTERVAL, LOCK_DIR, SELF_UPDATE=0.
set -u
umask 022

HOST_DIR="${HOST_DIR:-}"
UPDATE_REPO="${UPDATE_REPO:-SebastianKristo/torskenes-verden}"
UPDATE_BRANCH="${UPDATE_BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://os:3000/healthz}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
TAGS_INTERVAL="${TAGS_INTERVAL:-3600}"   # sekunder mellom hver gang taggene leses fra GitHub (0 = aldri)
HEALTH_SLEEP="${HEALTH_SLEEP:-3}"
INTERVAL="${INTERVAL:-5}"
LOCK_DIR="${LOCK_DIR:-/tmp}"
SELF_UPDATE="${SELF_UPDATE:-1}"
REQUEST_MAX_AGE="${REQUEST_MAX_AGE:-900}"   # sekunder; eldre forespørsler ignoreres
LOG_MAX=200000

say() { printf '%s [updater] %s\n' "$(date '+%F %T')" "$*" >&2; }
die() { say "$*"; exit 1; }

# ---------- Sjekk oppsettet før noe skrives ----------
case "$HOST_DIR" in /*) ;; *) die "HOST_DIR må være en absolutt sti (prosjektmappen på verten). Er compose kjørt fra prosjektmappen?" ;; esac
HOST_DIR="${HOST_DIR%/}"
[ -f "$HOST_DIR/docker-compose.yml" ] || die "Fant ikke $HOST_DIR/docker-compose.yml. Prosjektmappen må monteres på samme sti som på verten."
[ -d "$HOST_DIR/data" ] || die "Fant ikke $HOST_DIR/data."
[[ "$UPDATE_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "Ugyldig UPDATE_REPO."
[[ "$UPDATE_BRANCH" =~ ^[A-Za-z0-9._/-]+$ && "$UPDATE_BRANCH" != *..* ]] || die "Ugyldig UPDATE_BRANCH."

UPD="$HOST_DIR/data/update"
LOG="$UPD/log.txt"
mkdir -p "$UPD" || die "Kan ikke lage $UPD."
# Serveren (PUID, vanligvis 1000) skal kunne skrive request.json, så mappen får samme eier som data/.
chown "$(stat -c %u:%g "$HOST_DIR/data")" "$UPD" 2>/dev/null || true

# Prosjektnavnet: helst fra compose-etiketten på vår egen container, så vi treffer det som faktisk kjører.
PROJECT=""
SELF="${HOSTNAME:-}"
if [ -n "$SELF" ]; then
  PROJECT=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$SELF" 2>/dev/null || true)
  WORKDIR=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$SELF" 2>/dev/null || true)
  if [ -n "$WORKDIR" ] && [ "$WORKDIR" != "<no value>" ] && [ "${WORKDIR%/}" != "$HOST_DIR" ]; then
    die "Compose ble startet fra $WORKDIR, men HOST_DIR er $HOST_DIR. Kjør compose med cd til prosjektmappen."
  fi
fi
[ "$PROJECT" = "<no value>" ] && PROJECT=""
PROJECT="${PROJECT:-${COMPOSE_PROJECT_NAME:-homelab-os}}"
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "Ugyldig compose-prosjektnavn: $PROJECT"

now_ms() { echo $(( $(date +%s) * 1000 )); }
log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LOG"; }
trim_log() {
  local s; s=$(wc -c <"$LOG" 2>/dev/null || echo 0)
  if [ "$s" -gt "$LOG_MAX" ]; then tail -c "$LOG_MAX" "$LOG" >"$LOG.tmp" && mv -f "$LOG.tmp" "$LOG"; fi
}

write_heartbeat() { date +%s >"$UPD/.heartbeat.tmp" && mv -f "$UPD/.heartbeat.tmp" "$UPD/heartbeat"; }

JOB_ID=""; STARTED=""; FINISHED=""; SHA=""; VERSION=""; ACTION="update"
write_status() { # state step [error]
  jq -n --arg id "$JOB_ID" --arg state "$1" --arg step "$2" --arg error "${3:-}" --arg sha "$SHA" --arg version "$VERSION" \
    --arg startedAt "$STARTED" --arg finishedAt "$FINISHED" --arg action "$ACTION" \
    '{id:$id, state:$state, step:$step, action:$action,
      startedAt:(if $startedAt=="" then null else ($startedAt|tonumber) end),
      finishedAt:(if $finishedAt=="" then null else ($finishedAt|tonumber) end),
      error:(if $error=="" then null else $error end), sha:(if $sha=="" then null else $sha end),
      version:(if $version=="" then null else $version end)}' >"$UPD/.status.tmp" \
    && mv -f "$UPD/.status.tmp" "$UPD/status.json"
}

PROFILE=()
compose() { docker compose --project-directory "$HOST_DIR" -p "$PROJECT" "${PROFILE[@]}" "$@"; }

TMPD=""
cleanup_tmp() { [ -n "$TMPD" ] && rm -rf "$TMPD"; TMPD=""; }

fail() { # melding
  FINISHED=$(now_ms)
  local tail_lines; tail_lines=$(tail -n 12 "$LOG" 2>/dev/null | cut -c1-300)
  log "FEILET: $1"
  write_status failed "Feilet" "$1${tail_lines:+

Siste linjer i loggen:
$tail_lines}"
  cleanup_tmp
  trim_log
  return 1
}

# Historikk over vellykkede installasjoner, nyeste først: {"entries":[{sha, version, at}]} (maks 10). Bare updateren skriver.
HISTORY="$UPD/history.json"
history_entries() { jq -c 'if type=="object" and (.entries|type)=="array" then [.entries[] | select(type=="object" and ((.sha // "")|test("^[0-9a-f]{40}$")))] else [] end' "$HISTORY" 2>/dev/null || echo '[]'; }
write_history() { # json-liste
  printf '%s' "$1" | jq -c '{entries: (.[0:10])}' >"$UPD/.history.tmp" 2>/dev/null && mv -f "$UPD/.history.tmp" "$HISTORY"
}
# Prompt 44: versjonslista (versions.json) = installerte (history) + tagger lest fra GitHub (.tags.json), nyeste 10 etter semver.
TAGS="$UPD/.tags.json"
semver_ok() { [[ "$1" =~ ^[0-9]{1,4}\.[0-9]{1,5}\.[0-9]{1,6}$ ]]; }
refresh_tags() {
  local j
  j=$(curl -fsSL --max-time 20 -H 'Accept: application/vnd.github+json' -H 'User-Agent: homelab-updater' \
    "https://api.github.com/repos/$UPDATE_REPO/tags?per_page=40" 2>/dev/null) || return 0
  printf '%s' "$j" | jq -c '[ .[]? | select(type=="object") | {version: ((.name // "") | sub("^v"; "")), sha: (.commit.sha // "")}
    | select((.version|test("^[0-9]{1,4}\\.[0-9]{1,5}\\.[0-9]{1,6}$")) and (.sha|test("^[0-9a-f]{40}$"))) ]' >"$UPD/.tags.tmp" 2>/dev/null \
    && mv -f "$UPD/.tags.tmp" "$TAGS"
  write_versions
}
write_versions() {
  local h t cur
  h=$(history_entries)
  t=$(jq -c 'if type=="array" then . else [] end' "$TAGS" 2>/dev/null || echo '[]')
  cur=$(jq -r '.version // empty' "$UPD/installed.json" 2>/dev/null || true)
  jq -n --argjson h "$h" --argjson t "$t" --arg cur "$cur" --argjson now "$(now_ms)" '
    def key: (.version | split(".") | map(tonumber? // 0));
    ([ $h[] | select((.version // "") | test("^[0-9]+\\.[0-9]+\\.[0-9]+$")) | {version, sha, date:(.at // null), installed:true, dbSchema:(.dbSchema // null), source:"installed"} ]
     + [ $t[] | {version, sha, date:null, installed:false, dbSchema:null, source:"release"} ])
    | group_by(.version) | map(sort_by(if .installed then 0 else 1 end) | .[0]) | sort_by(key) | reverse | .[0:10] as $v
    | {updatedAt:$now, current:(if $cur=="" then null else $cur end), versions:$v}' >"$UPD/.versions.tmp" 2>/dev/null && mv -f "$UPD/.versions.tmp" "$UPD/versions.json"
}
# Sha for en versjon fra updaterens EGEN liste (versions.json/history), eller tomt.
sha_for_version() {
  semver_ok "$1" || return 0
  jq -r --arg v "$1" '[.versions[]? | select(.version==$v) | .sha | select(test("^[0-9a-f]{40}$"))][0] // empty' "$UPD/versions.json" 2>/dev/null || true
}
# Backupen tatt rett før oppdateringen bort fra versjon $1 (serverens pre-update-*.json med fromVersion), eller tomt.
backup_for_version() {
  semver_ok "$1" || return 0
  local idx="$HOST_DIR/data/backups/update-backups.json" name
  name=$(jq -r --arg v "$1" '[.items[]? | select(type=="object" and .fromVersion==$v and ((.name // "")|test("^pre-update-[A-Za-z0-9-]{1,60}\\.db$")))] | sort_by(.at // 0) | reverse | .[0].name // empty' "$idx" 2>/dev/null || true)
  [ -n "$name" ] && [ -f "$HOST_DIR/data/backups/$name" ] && printf '%s' "$name"
  return 0
}
# Første gang: ta med det som allerede er installert (installed.json fra før historikken fantes).
seed_history() {
  local h; h=$(history_entries)
  if [ "$(printf '%s' "$h" | jq 'length')" = 0 ] && [ -f "$UPD/installed.json" ]; then
    h=$(jq -c 'if type=="object" and ((.sha // "")|test("^[0-9a-f]{40}$")) then [{sha, version:(.version // null), at:(.at // null)}] else [] end' "$UPD/installed.json" 2>/dev/null || echo '[]')
    write_history "$h"
  fi
}

run_job() {
  JOB_ID="$1"; STARTED=$(now_ms); FINISHED=""; SHA=""; VERSION=""; ACTION="${3:-update}"
  local TARGET="${4:-}" RESTORE="${5:-}" FROM_SHA="" FROM_VERSION="" BACKUP="" RESTORED=""
  : >"$LOG"
  seed_history
  write_versions
  FROM_SHA=$(history_entries | jq -r '.[0].sha // empty'); FROM_VERSION=$(history_entries | jq -r '.[0].version // empty')
  if [ "$ACTION" = rollback ]; then
    log "Tilbakerulling $JOB_ID startet (forespurt av ${2:-ukjent}). Repo $UPDATE_REPO, prosjekt $PROJECT, mappe $HOST_DIR."
  else
    log "Oppdatering $JOB_ID startet (forespurt av ${2:-ukjent}). Repo $UPDATE_REPO, branch $UPDATE_BRANCH, prosjekt $PROJECT, mappe $HOST_DIR."
  fi

  # 1. Last ned (rollback: forrige vellykkede sha fra historikken)
  if [ "$ACTION" = rollback ] && [ -n "$TARGET" ]; then
    # Prompt 44: målversjonen MÅ finnes i updaterens egen liste.
    write_status downloading "Laster ned $TARGET"
    SHA=$(sha_for_version "$TARGET")
    [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { SHA=""; fail "Versjon $TARGET finnes ikke i updaterens liste over tidligere versjoner."; return; }
    [ "$SHA" != "$FROM_SHA" ] || { fail "Versjon $TARGET kjører allerede."; return; }
    if [ "$RESTORE" = 1 ]; then
      BACKUP=$(backup_for_version "$TARGET")
      [ -n "$BACKUP" ] || { fail "Fant ingen backup fra før oppdateringen fra $TARGET. Velg «Behold dataene mine»."; return; }
      log "Gjenoppretter backup $BACKUP etter byggingen."
    fi
    log "Går tilbake til $TARGET ($SHA)"
  elif [ "$ACTION" = rollback ]; then
    write_status downloading "Laster ned forrige versjon"
    SHA=$(history_entries | jq -r '.[1].sha // empty')
    [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { SHA=""; fail "Fant ingen tidligere versjon å gå tilbake til."; return; }
    log "Går tilbake til $SHA"
  else
    write_status downloading "Laster ned siste versjon"
  fi
  TMPD=$(mktemp -d "${TMPDIR:-/tmp}/homelab-update.XXXXXX") || { fail "Kunne ikke lage midlertidig mappe."; return; }
  if [ "$ACTION" != rollback ]; then
  SHA=$(curl -fsSL --max-time 30 -H 'Accept: application/vnd.github+json' -H 'User-Agent: homelab-updater' \
    "https://api.github.com/repos/$UPDATE_REPO/commits/$UPDATE_BRANCH" 2>>"$LOG" | jq -r '.sha // empty' 2>>"$LOG")
  [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { SHA=""; fail "Fant ikke siste versjon på GitHub ($UPDATE_REPO, $UPDATE_BRANCH). Er repoet offentlig og nettet oppe?"; return; }
  log "Siste commit: $SHA"
  fi
  curl -fsSL --max-time 300 -H 'User-Agent: homelab-updater' -o "$TMPD/src.tgz" \
    "https://codeload.github.com/$UPDATE_REPO/tar.gz/$SHA" 2>>"$LOG" || { fail "Nedlastingen feilet."; return; }
  mkdir "$TMPD/src"
  tar -xzf "$TMPD/src.tgz" -C "$TMPD/src" --strip-components=1 --no-same-owner 2>>"$LOG" || { fail "Kunne ikke pakke ut arkivet."; return; }
  local SRC="$TMPD/src"
  [ -f "$SRC/docker-compose.yml" ] && [ -f "$SRC/server/index.js" ] || { fail "Arkivet mangler docker-compose.yml eller server/index.js. Ingenting er endret."; return; }
  # Prompt 36: «## [4.29.0]», «## 4.29.0» og «## v4.29.0 – dato» (samme regler som parseChangelog i serveren).
  VERSION=$(sed -n -E 's/^## *\[? *[vV]?([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' "$SRC/CHANGELOG.md" 2>/dev/null | head -n 1)
  log "Versjon i arkivet: ${VERSION:-ukjent}"
  # Prompt 44: databaseskjemaet til versjonen (DB_SCHEMA i server/system-update.js), lagres i historikken.
  DBSCHEMA=$(sed -n -E 's/^export const DB_SCHEMA = ([0-9]{1,6}).*/\1/p' "$SRC/server/system-update.js" 2>/dev/null | head -n 1)

  # 2. Kopier inn. .env, data/ og proton/ fjernes fra kopien og utelates i tillegg (bare på toppnivå: server/data er kode).
  rm -rf "$SRC/.env" "$SRC/data" "$SRC/proton"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude '/.env' --exclude '/data/' --exclude '/proton/' "$SRC/" "$HOST_DIR/" >>"$LOG" 2>&1 \
      || { fail "Kunne ikke kopiere de nye filene inn i $HOST_DIR."; return; }
  else
    cp -a "$SRC/." "$HOST_DIR/" >>"$LOG" 2>&1 || { fail "Kunne ikke kopiere de nye filene inn i $HOST_DIR."; return; }
  fi
  cleanup_tmp
  log "Filene er kopiert inn i $HOST_DIR (.env, data/ og proton/ er ikke rørt)."

  # 3. Bygg
  PROFILE=()
  local services=(os)
  if grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=.+' "$HOST_DIR/.env" 2>/dev/null; then PROFILE=(--profile tunnel); services=(os cloudflared); fi
  write_status building "Bygger ny versjon"
  log "docker compose ${PROFILE[*]} build os"
  if ! compose build os >>"$LOG" 2>&1; then
    fail "Bygget feilet. Den gamle versjonen kjører videre (ingenting er startet på nytt), men de nye filene er allerede kopiert inn i $HOST_DIR. Neste vellykkede oppdatering retter det."
    return
  fi

  # 4. Start på nytt (bare os og ev. cloudflared – aldri updater midt i jobben)
  write_status restarting "Starter på nytt"
  local DB="$HOST_DIR/data/homelab.db" KEEP_DB=""
  if [ -n "$BACKUP" ]; then
    # Prompt 44: databasen byttes mens os er stoppet. Innholdet skrives inn i samme fil (eier og rettigheter beholdes).
    compose stop os >>"$LOG" 2>&1 || true
    KEEP_DB="$HOST_DIR/data/backups/pre-rollback-$(date +%Y-%m-%dT%H-%M-%S).db"
    cp -p "$DB" "$KEEP_DB" 2>>"$LOG" || { fail "Kunne ikke ta kopi av databasen før gjenopprettingen. Ingenting er endret i dataene."; return; }
    cat "$HOST_DIR/data/backups/$BACKUP" >"$DB" 2>>"$LOG" || { cat "$KEEP_DB" >"$DB"; fail "Kunne ikke gjenopprette backupen $BACKUP."; return; }
    rm -f "$DB-wal" "$DB-shm"
    RESTORED=1
    log "Databasen er gjenopprettet fra $BACKUP (kopi av den forrige: $(basename "$KEEP_DB"))."
  fi
  log "docker compose ${PROFILE[*]} up -d --no-deps ${services[*]}"
  compose up -d --no-deps "${services[@]}" >>"$LOG" 2>&1 || { fail "Kunne ikke starte den nye versjonen. Se loggen, og kjør update.sh fra Proxmox hvis serveren ikke svarer."; return; }

  # 5. Vent på at den nye versjonen svarer (HEALTH_TIMEOUT, 90 s). Ellers: tilbake til versjonen vi kom fra.
  if ! wait_healthy; then
    local why="Ny versjon startet ikke innen $HEALTH_TIMEOUT sekunder"
    [ "$ACTION" = rollback ] && why="Kunne ikke gå tilbake til ${TARGET:-${VERSION:-forrige versjon}} (svarte ikke innen $HEALTH_TIMEOUT sekunder)"
    if [[ "$FROM_SHA" =~ ^[0-9a-f]{40}$ ]] && [ "$FROM_SHA" != "$SHA" ]; then
      log "$why. Går automatisk tilbake til ${FROM_VERSION:-$FROM_SHA}."
      write_status restarting "Går tilbake til ${FROM_VERSION:-forrige versjon}"
      [ -n "$RESTORED" ] && [ -n "$KEEP_DB" ] && { compose stop os >>"$LOG" 2>&1 || true; cat "$KEEP_DB" >"$DB"; rm -f "$DB-wal" "$DB-shm"; log "Databasen er satt tilbake."; }
      if install_sha "$FROM_SHA" && wait_healthy; then
        local sha_new="$SHA"; SHA="$FROM_SHA"; VERSION="$FROM_VERSION"
        fail "$why. Gikk automatisk tilbake · kjører ${FROM_VERSION:-forrige versjon} som før (${sha_new:0:7} ble ikke tatt i bruk)."
        jq -n --arg sha "$FROM_SHA" --arg version "$FROM_VERSION" --argjson at "$(now_ms)" '{sha:$sha, version:(if $version=="" then null else $version end), at:$at}' >"$UPD/.installed.tmp" && mv -f "$UPD/.installed.tmp" "$UPD/installed.json"
        return
      fi
      fail "$why, og tilbakegangen til ${FROM_VERSION:-forrige versjon} svarte heller ikke. Kjør update.sh fra Proxmox."
      return
    fi
    fail "$why. Se loggen og 'docker compose logs os'."; return
  fi

  FINISHED=$(now_ms)
  jq -n --arg sha "$SHA" --arg version "$VERSION" --argjson at "$FINISHED" '{sha:$sha, version:(if $version=="" then null else $version end), at:$at}' \
    >"$UPD/.installed.tmp" && mv -f "$UPD/.installed.tmp" "$UPD/installed.json"
  # Historikk: ny versjon øverst. Rollback fjerner versjonen vi gikk bort fra, så neste rollback går enda ett steg tilbake.
  # Prompt 44: rollback til en valgt versjon beholder versjonen vi kom fra (så «Oppdater til X igjen» finnes i lista).
  local h; h=$(history_entries)
  local ENTRY; ENTRY=$(jq -cn --arg sha "$SHA" --arg version "$VERSION" --argjson at "$FINISHED" --arg db "${DBSCHEMA:-}" '{sha:$sha, version:(if $version=="" then null else $version end), at:$at, dbSchema:(if $db=="" then null else ($db|tonumber) end)}')
  if [ "$ACTION" = rollback ] && [ -n "$TARGET" ]; then
    write_history "$(printf '%s' "$h" | jq -c --argjson e "$ENTRY" '[$e] + [.[] | select(.sha != $e.sha)]')"
  elif [ "$ACTION" = rollback ]; then
    write_history "$(printf '%s' "$h" | jq -c --argjson e "$ENTRY" '[$e] + .[2:]')"
  else
    write_history "$(printf '%s' "$h" | jq -c --argjson e "$ENTRY" '[$e] + [.[] | select(.sha != $e.sha)]')"
  fi
  write_versions
  [ -n "$RESTORED" ] && log "update.rollback to=${VERSION:-?} restore=true result=ok"
  [ "$ACTION" = rollback ] && [ -z "$RESTORED" ] && log "update.rollback to=${VERSION:-?} restore=false result=ok"
  log "Ferdig: ${VERSION:-ukjent versjon} (${SHA:0:7})."
  write_status "done" "Ferdig"

  # 6. Rydd, og oppdater til slutt updateren selv (ikke ved rollback: en eldre updater kjenner kanskje ikke historikken).
  docker image prune -f >>"$LOG" 2>&1 || true
  [ "$SELF_UPDATE" = 1 ] && [ "$ACTION" != rollback ] && self_update
  trim_log
  return 0
}

# Prompt 44: venter på helsesjekken (HEALTH_TIMEOUT sekunder).
wait_healthy() {
  local deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep "$HEALTH_SLEEP"
  done
  return 1
}
# Prompt 44: installerer en kjent sha på nytt (automatisk tilbakegang). Samme regler som run_job: .env, data/ og proton/ røres ikke.
install_sha() {
  local sha="$1" d
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || return 1
  d=$(mktemp -d "${TMPDIR:-/tmp}/homelab-revert.XXXXXX") || return 1
  curl -fsSL --max-time 300 -H 'User-Agent: homelab-updater' -o "$d/src.tgz" "https://codeload.github.com/$UPDATE_REPO/tar.gz/$sha" 2>>"$LOG" || { rm -rf "$d"; return 1; }
  mkdir "$d/src" && tar -xzf "$d/src.tgz" -C "$d/src" --strip-components=1 --no-same-owner 2>>"$LOG" || { rm -rf "$d"; return 1; }
  [ -f "$d/src/docker-compose.yml" ] && [ -f "$d/src/server/index.js" ] || { rm -rf "$d"; return 1; }
  rm -rf "$d/src/.env" "$d/src/data" "$d/src/proton"
  if command -v rsync >/dev/null 2>&1; then rsync -a --exclude '/.env' --exclude '/data/' --exclude '/proton/' "$d/src/" "$HOST_DIR/" >>"$LOG" 2>&1 || { rm -rf "$d"; return 1; }
  else cp -a "$d/src/." "$HOST_DIR/" >>"$LOG" 2>&1 || { rm -rf "$d"; return 1; }; fi
  rm -rf "$d"
  compose build os >>"$LOG" 2>&1 || return 1
  local services=(os); [ "${#PROFILE[@]}" -gt 0 ] && services=(os cloudflared)
  compose up -d --no-deps "${services[@]}" >>"$LOG" 2>&1 || return 1
  return 0
}

# Updateren kan ikke gjenskape sin egen container (compose ville drept prosessen midt i). Bildet bygges her, og en
# kortlivet hjelpecontainer utenfor compose-prosjektet kjører «up -d --no-deps updater». Status er allerede «done».
self_update() {
  log "Oppdaterer updateren selv …"
  if ! compose build updater >>"$LOG" 2>&1; then log "Klarte ikke å bygge updateren (ikke kritisk, den gamle kjører videre)."; return 0; fi
  local img; img=$(docker inspect --format '{{.Config.Image}}' "$SELF" 2>/dev/null || true)
  [ -n "$img" ] || img="homelab-updater:local"
  docker rm -f "$PROJECT-updater-selfupdate" >/dev/null 2>&1 || true
  docker run -d --rm --name "$PROJECT-updater-selfupdate" \
    -v /var/run/docker.sock:/var/run/docker.sock -v "$HOST_DIR:$HOST_DIR" -w "$HOST_DIR" \
    -e "PWD=$HOST_DIR" -e "UPDATE_REPO=$UPDATE_REPO" -e "UPDATE_BRANCH=$UPDATE_BRANCH" -e "COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-}" \
    --entrypoint docker "$img" \
    compose --project-directory "$HOST_DIR" -p "$PROJECT" up -d --no-deps updater >>"$LOG" 2>&1 \
    || log "Klarte ikke å starte hjelpecontaineren for selvoppdatering (ikke kritisk)."
}

# ---------- Hovedløkke ----------
cd "$HOST_DIR" || die "Kan ikke gå til $HOST_DIR."
export PWD="$HOST_DIR"   # docker-compose.yml bruker ${PWD} for updaterens egen montering

LOCK="$LOCK_DIR/homelab-updater.lock"
mkdir "$LOCK" 2>/dev/null || { [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ] && rm -rf "$LOCK" && mkdir "$LOCK"; } || die "En annen updater kjører allerede ($LOCK)."
HB_PID=""
trap 'rm -rf "$LOCK"; [ -n "$HB_PID" ] && kill "$HB_PID" 2>/dev/null; cleanup_tmp' EXIT
trap 'exit 0' INT TERM

# Hjerteslag også mens en jobb kjører (bygg kan ta minutter).
write_heartbeat
if [ -z "${ONCE:-}" ]; then ( while sleep "$INTERVAL"; do write_heartbeat; done ) & HB_PID=$!; fi

LAST_ID=$(jq -r '.id // empty' "$UPD/status.json" 2>/dev/null || true)
# En jobb som var i gang da updateren stoppet (omstart av LXC-en e.l.) er avbrutt.
prev_state=$(jq -r '.state // empty' "$UPD/status.json" 2>/dev/null || true)
case "$prev_state" in downloading|building|restarting)
  JOB_ID="$LAST_ID"; STARTED=$(jq -r '.startedAt // empty' "$UPD/status.json"); FINISHED=$(now_ms)
  SHA=$(jq -r '.sha // empty' "$UPD/status.json"); VERSION=$(jq -r '.version // empty' "$UPD/status.json")
  ACTION=$(jq -r '(.action // "update") | strings' "$UPD/status.json" 2>/dev/null); case "$ACTION" in update|rollback) ;; *) ACTION=update ;; esac
  write_status failed "Avbrutt" "Oppdateringen ble avbrutt fordi updateren startet på nytt. Prøv igjen."
  ;;
esac
say "Klar. Prosjekt $PROJECT i $HOST_DIR, repo $UPDATE_REPO ($UPDATE_BRANCH)."
write_versions
[ -n "${TAGS_ONCE:-}" ] && refresh_tags

while :; do
  if [ -f "$UPD/request.json" ]; then
    id=$(jq -r 'if type=="object" then (.id // empty) else empty end' "$UPD/request.json" 2>/dev/null | head -c 100 || true)
    if [ -n "$id" ] && [ "$id" != "$LAST_ID" ]; then
      LAST_ID="$id"
      if [[ ! "$id" =~ ^[A-Za-z0-9-]{1,64}$ ]]; then
        say "Ignorerer forespørsel med ugyldig id."
      else
        at=$(jq -r '(.at // 0) | numbers | floor' "$UPD/request.json" 2>/dev/null || true); [[ "$at" =~ ^[0-9]{1,15}$ ]] || at=0
        by=$(jq -r '(.requestedBy // "") | strings' "$UPD/request.json" 2>/dev/null | tr -cd 'A-Za-z0-9._@-' | head -c 64)
        act=$(jq -r '(.action // "update") | strings' "$UPD/request.json" 2>/dev/null | head -c 20)
        case "$act" in update|rollback) ;; *) act="" ;; esac
        # Prompt 44: target (bare semver, slås opp i updaterens egen liste) og restoreBackup (bare true/false).
        tgt=$(jq -r 'if (.target|type)=="string" then .target else "" end' "$UPD/request.json" 2>/dev/null | head -c 20)
        if [ -n "$tgt" ] && ! semver_ok "$tgt"; then say "Ignorerer forespørsel $id med ugyldig target."; act=""; fi
        rst=$(jq -r 'if .restoreBackup==true then "1" else "" end' "$UPD/request.json" 2>/dev/null)
        [ "$act" = rollback ] || { tgt=""; rst=""; }
        age=$(( $(date +%s) - at / 1000 ))
        if [ -z "$act" ]; then
          say "Ignorerer forespørsel $id med ukjent action."
        elif [ "$age" -gt "$REQUEST_MAX_AGE" ]; then
          say "Ignorerer gammel forespørsel $id ($age s)."
        else
          if [ "$act" = rollback ]; then say "Starter tilbakerulling $id."; else say "Starter oppdatering $id."; fi
          if run_job "$id" "$by" "$act" "$tgt" "$rst"; then say "Oppdatering $id ferdig."; else say "Oppdatering $id feilet."; fi
        fi
      fi
    fi
  fi
  [ -n "${ONCE:-}" ] && break
  # Prompt 44: les taggene (tidligere versjoner) selv, sjelden.
  if [ "$TAGS_INTERVAL" -gt 0 ] && [ $(( $(date +%s) - ${TAGS_AT:-0} )) -ge "$TAGS_INTERVAL" ]; then TAGS_AT=$(date +%s); refresh_tags; fi
  sleep "$INTERVAL"
done
