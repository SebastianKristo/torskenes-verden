#!/usr/bin/env bash
# Updater for Homelab OS: gjør «Oppdater nå» i Innstillinger → System til en oppdatering, akkurat som update.sh.
#
# Kjører i sin egen container med Docker-socketen (= root i LXC-en). Derfor:
# - Ingen nettverksport. Den leser bare data/update/request.json, og bare feltene «id» og «action» brukes (validert).
#   action er 'update' (standard), 'rollback' eller (prompt 45) 'docker-setup' (bare Docker-tilgangen for Logger, se ensure_docker_proxy). Ved rollback laster updateren ned forrige vellykkede sha fra sin
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
#
# Prompt 46 (SERVER46, «står fast på 55 %»): 55 % er steget «building». Rotårsakene var:
#  1. Ingen tidsavbrudd: `docker compose build os` kunne vente for alltid (npm/apt som henger på nett, OOM i en liten LXC),
#     og status.json ble stående på «building» uten at noe skjedde.
#  2. Låsen var en mappe i containerens /tmp. Ble updateren drept midt i jobben (OOM, omstart av LXC, docker restart),
#     overlevde mappen omstarten (samme container), og den nye prosessen døde på «En annen updater kjører allerede» i opptil
#     60 min – i en omstartsløkke uten hjerteslag. Da ble status.json aldri satt til «Avbrutt», og serveren nektet ny start
#     («pågår allerede» / «ikke satt opp») til man startet på nytt fra Proxmox.
#  3. Byggkonteksten var hele repoet (~150 MB med design_handoff_homelab/ og apps/), som gjør bygget tregere og tyngre i minnet.
# Nå: hvert steg har tidsavbrudd (nedlasting DOWNLOAD_TIMEOUT 10 min, bygg BUILD_TIMEOUT 20 min, oppstart UP_TIMEOUT 90 s,
# helsesjekk HEALTH_TIMEOUT 90 s; backupen tar serveren selv med 5 min grense), en vakt merker jobben «står fast» når loggen ikke
# har vokst på STALL_TIMEOUT (180 s) sekunder (stuckSince/progressAt/lastLine i status.json), og brukeren kan be om
# {action:'retry'} (stopp steget og kjør det på nytt) eller {action:'abort'} (stopp og bli på / gå tilbake til forrige versjon)
# mens jobben kjører. {action:'prune'} rydder dinglende bilder og gammel byggcache (aldri volumer, aldri navngitte bilder).
# Låsen er en fil med PID og tid: død prosess eller eldre enn LOCK_MAX_AGE (30 min, fornyes av hjerteslaget) ryddes.
# Før start sjekkes ledig disk (MIN_DISK_MB, 3 GB) og minne (MIN_RAM_MB, 1 GB). Updateren stopper/erstatter aldri seg selv
# midt i en jobb: compose up får aldri «updater», og selvoppdateringen skjer etter at status er «done».
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
# Prompt 46: tidsavbrudd per steg (sekunder), vakt og ressurskrav.
DOWNLOAD_TIMEOUT="${DOWNLOAD_TIMEOUT:-600}"
BUILD_TIMEOUT="${BUILD_TIMEOUT:-1200}"
UP_TIMEOUT="${UP_TIMEOUT:-90}"
STALL_TIMEOUT="${STALL_TIMEOUT:-180}"
WATCH_SLEEP="${WATCH_SLEEP:-2}"
MIN_DISK_MB="${MIN_DISK_MB:-3072}"
MIN_RAM_MB="${MIN_RAM_MB:-1024}"
LOCK_MAX_AGE="${LOCK_MAX_AGE:-1800}"
PRUNE_TIMEOUT="${PRUNE_TIMEOUT:-300}"
for _v in DOWNLOAD_TIMEOUT BUILD_TIMEOUT UP_TIMEOUT STALL_TIMEOUT WATCH_SLEEP MIN_DISK_MB MIN_RAM_MB LOCK_MAX_AGE PRUNE_TIMEOUT HEALTH_TIMEOUT; do
  [[ "${!_v}" =~ ^[0-9]{1,7}$ ]] || { printf 'Ugyldig %s\n' "$_v" >&2; exit 1; }
done
[ "$WATCH_SLEEP" -ge 1 ] || WATCH_SLEEP=1
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
# Prompt 46: fremdrift og vakt. CUR_STATE/CUR_STEP = steget som kjører nå, PROGRESS_S = sist loggen vokste (sekunder),
# STUCK_SINCE = ms da vakten merket «står fast» (tomt ellers), CODE = maskinlesbar feilkode (timeout|oom|low_disk|low_ram|
# disk_full|network|cancelled|health|build), FROM_VERSION = versjonen jobben startet fra (for «Avbryt og gå tilbake til 4.21»).
CUR_STATE=""; CUR_STEP=""; PROGRESS_S=""; LAST_LINE=""; STUCK_SINCE=""; CODE=""; FROM_VERSION=""; DISK_MB=""; RAM_MB=""; ATTEMPT=1; CTRL=""
write_status() { # state step [error]
  jq -n --arg id "$JOB_ID" --arg state "$1" --arg step "$2" --arg error "${3:-}" --arg sha "$SHA" --arg version "$VERSION" \
    --arg startedAt "$STARTED" --arg finishedAt "$FINISHED" --arg action "$ACTION" \
    --arg progressAt "${PROGRESS_S:+$(( PROGRESS_S * 1000 ))}" --arg lastLine "$LAST_LINE" --arg stuckSince "$STUCK_SINCE" --arg code "$CODE" \
    --arg fromVersion "$FROM_VERSION" --arg disk "$DISK_MB" --arg ram "$RAM_MB" --arg attempt "$ATTEMPT" --argjson now "$(now_ms)" \
    '{id:$id, state:$state, step:$step, action:$action,
      startedAt:(if $startedAt=="" then null else ($startedAt|tonumber) end),
      finishedAt:(if $finishedAt=="" then null else ($finishedAt|tonumber) end),
      error:(if $error=="" then null else $error end), sha:(if $sha=="" then null else $sha end),
      version:(if $version=="" then null else $version end),
      updatedAt:$now, progressAt:(if $progressAt=="" then null else ($progressAt|tonumber) end),
      lastLine:(if $lastLine=="" then null else $lastLine end), stuckSince:(if $stuckSince=="" then null else ($stuckSince|tonumber) end),
      code:(if $code=="" then null else $code end), fromVersion:(if $fromVersion=="" then null else $fromVersion end),
      attempt:($attempt|tonumber),
      resources:(if $disk=="" and $ram=="" then null else {diskFreeMb:(if $disk=="" then null else ($disk|tonumber) end), ramFreeMb:(if $ram=="" then null else ($ram|tonumber) end)} end)}' >"$UPD/.status.tmp" \
    && mv -f "$UPD/.status.tmp" "$UPD/status.json"
}
set_state() { CUR_STATE="$1"; CUR_STEP="$2"; STUCK_SINCE=""; PROGRESS_S=$(date +%s); write_status "$1" "$2"; }

PROFILE=()
compose() { docker compose --project-directory "$HOST_DIR" -p "$PROJECT" "${PROFILE[@]}" "$@"; }
# Prompt 46: samme kommando som en ekte kjørbar (timeout kan ikke kjøre skallfunksjoner).
compose_argv() { COMPOSE=(docker compose --project-directory "$HOST_DIR" -p "$PROJECT" "${PROFILE[@]}"); }

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

# Prompt 46: feil med kode (timeout, oom, low_disk …) – serveren viser «Står fast»/årsak ut fra den.
fail_code() { CODE="$1"; shift; fail "$@"; }

# Gjetter årsaken ut fra loggen (OOM, full disk, nett). Skriver koden på stdout, eller tomt.
guess_cause() {
  local t; t=$(tail -n 80 "$LOG" 2>/dev/null)
  if printf '%s' "$t" | grep -qiE 'no space left on device|ENOSPC'; then echo disk_full
  elif printf '%s' "$t" | grep -qiE 'out of memory|cannot allocate memory|ENOMEM|exit code: 137|signal: killed|Killed$|OOMKilled'; then echo oom
  elif printf '%s' "$t" | grep -qiE 'ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNRESET|Temporary failure resolving|Could not resolve|i/o timeout|TLS handshake timeout|network is unreachable'; then echo network
  fi
}
cause_text() {
  case "$1" in
    oom) echo "Serveren gikk tom for minne under byggingen." ;;
    disk_full) echo "Disken på serveren ble full under byggingen." ;;
    network) echo "Nettet falt ut eller svarte ikke under nedlastingen." ;;
  esac
}

# Prompt 46: kontrollforespørsler mens en jobb kjører. Bare {action:'retry'|'abort'} plukkes opp her (ny id, fersk, gyldig);
# andre forespørsler blir liggende til jobben er ferdig. Setter CTRL (retry|abort) – ingenting annet leses fra fila.
check_control() {
  CTRL=""
  [ -f "$UPD/request.json" ] || return 0
  local id act at age
  id=$(jq -r 'if type=="object" then (.id // empty) else empty end' "$UPD/request.json" 2>/dev/null | head -c 100 || true)
  [ -n "$id" ] && [ "$id" != "$LAST_ID" ] && [ "$id" != "$JOB_ID" ] || return 0
  [[ "$id" =~ ^[A-Za-z0-9-]{1,64}$ ]] || return 0
  act=$(jq -r '(.action // "") | strings' "$UPD/request.json" 2>/dev/null | head -c 20)
  case "$act" in retry|abort) ;; *) return 0 ;; esac
  at=$(jq -r '(.at // 0) | numbers | floor' "$UPD/request.json" 2>/dev/null || true); [[ "$at" =~ ^[0-9]{1,15}$ ]] || at=0
  LAST_ID="$id"
  age=$(( $(date +%s) - at / 1000 ))
  [ "$age" -le "$REQUEST_MAX_AGE" ] || return 0
  CTRL="$act"
  say "Fikk $act ($id) mens jobben kjører."
}

# Prompt 46: kjører én kommando med tidsavbrudd og vakt. → 0 ok, 124 tidsavbrudd, 130 avbrutt av brukeren (CTRL=retry|abort),
# ellers kommandoens feilkode. Fremdrift = loggen (og ev. WATCH_FILE, f.eks. arkivet som lastes ned) vokser.
run_watched() { # sekunder kommando…
  local limit="$1"; shift
  local pid rc size last=-1 now i ticks=$(( WATCH_SLEEP * 2 ))
  CTRL=""
  timeout -k 20 "$limit" "$@" >>"$LOG" 2>&1 &
  pid=$!
  PROGRESS_S=$(date +%s)
  while kill -0 "$pid" 2>/dev/null; do
    for (( i = 0; i < ticks; i++ )); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$pid" 2>/dev/null || break
    now=$(date +%s)
    size=$(( $(wc -c <"$LOG" 2>/dev/null || echo 0) + $( [ -n "${WATCH_FILE:-}" ] && wc -c <"$WATCH_FILE" 2>/dev/null || echo 0) ))
    if [ "$size" != "$last" ]; then
      last="$size"; PROGRESS_S=$now
      LAST_LINE=$(tail -n 1 "$LOG" 2>/dev/null | tr -d '\r' | tr -cd '[:print:]\t' | cut -c1-200)
      [ -n "$STUCK_SINCE" ] && say "Fremdrift igjen i «$CUR_STEP»."
      STUCK_SINCE=""
      write_status "$CUR_STATE" "$CUR_STEP"
    elif [ -z "$STUCK_SINCE" ] && [ $(( now - PROGRESS_S )) -ge "$STALL_TIMEOUT" ]; then
      STUCK_SINCE=$(now_ms)
      say "Ingen fremgang i «$CUR_STEP» på $(( now - PROGRESS_S )) s – merket som «står fast»."
      write_status "$CUR_STATE" "$CUR_STEP"
    fi
    check_control
    if [ -n "$CTRL" ]; then
      log "Stopper «$CUR_STEP» (${CTRL} fra appen)."
      kill -TERM "$pid" 2>/dev/null
      for (( i = 0; i < 50; i++ )); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
      kill -KILL "$pid" 2>/dev/null
      wait "$pid" 2>/dev/null
      return 130
    fi
  done
  wait "$pid"; rc=$?
  [ "$rc" = 137 ] && [ -z "$CTRL" ] && rc=124   # timeout -k drepte den etter fristen
  return "$rc"
}

# Prompt 46: ledig disk (prosjektmappen = samme disk som Docker i LXC-en) og minne. → 0 ok, 1 for lite (feilet).
fmt_gb() { awk -v m="$1" 'BEGIN { s = sprintf("%.1f", m / 1024); sub(/\./, ",", s); print s }'; }
check_resources() {
  DISK_MB=$(df -Pm "$HOST_DIR" 2>/dev/null | awk 'NR==2 {print $4}')
  RAM_MB=$(awk '/^MemAvailable:/ {print int($2 / 1024)}' /proc/meminfo 2>/dev/null)
  [[ "$DISK_MB" =~ ^[0-9]+$ ]] || DISK_MB=""
  [[ "$RAM_MB" =~ ^[0-9]+$ ]] || RAM_MB=""
  log "Ressurser: ${DISK_MB:-?} MB ledig disk, ${RAM_MB:-?} MB ledig minne (krav $MIN_DISK_MB / $MIN_RAM_MB MB)."
  if [ -n "$DISK_MB" ] && [ "$DISK_MB" -lt "$MIN_DISK_MB" ]; then
    fail_code low_disk "Lite plass på serveren ($(fmt_gb "$DISK_MB") GB ledig, trenger minst $(fmt_gb "$MIN_DISK_MB") GB). Rydd gamle bilder og prøv igjen. Ingenting er endret."
    return 1
  fi
  if [ -n "$RAM_MB" ] && [ "$RAM_MB" -lt "$MIN_RAM_MB" ]; then
    fail_code low_ram "Lite ledig minne på serveren ($(fmt_gb "$RAM_MB") GB, trenger minst $(fmt_gb "$MIN_RAM_MB") GB). Stopp noe som bruker mye minne, eller gi LXC-en mer RAM. Ingenting er endret."
    return 1
  fi
  return 0
}

# Prompt 46: «Rydd» – dinglende bilder (gamle homelab-os-bygg uten navn) og byggcache eldre enn 3 døgn. Aldri volumer,
# aldri navngitte bilder. Status: data/update/maint.json {id, action:'prune', state, at, freedMb, diskFreeMb}.
run_prune() { # id
  local id="$1" before after
  before=$(df -Pm "$HOST_DIR" 2>/dev/null | awk 'NR==2 {print $4}'); [[ "$before" =~ ^[0-9]+$ ]] || before=0
  jq -n --arg id "$id" --argjson at "$(now_ms)" '{id:$id, action:"prune", state:"running", at:$at}' >"$UPD/.maint.tmp" && mv -f "$UPD/.maint.tmp" "$UPD/maint.json"
  log "Rydder: docker image prune -f · docker builder prune -f --filter until=72h"
  timeout -k 10 "$PRUNE_TIMEOUT" docker image prune -f >>"$LOG" 2>&1 || true
  timeout -k 10 "$PRUNE_TIMEOUT" docker builder prune -f --filter until=72h >>"$LOG" 2>&1 || true
  after=$(df -Pm "$HOST_DIR" 2>/dev/null | awk 'NR==2 {print $4}'); [[ "$after" =~ ^[0-9]+$ ]] || after=0
  local freed=$(( after - before )); [ "$freed" -lt 0 ] && freed=0
  log "Ryddet $freed MB. Ledig nå: $after MB."
  jq -n --arg id "$id" --argjson at "$(now_ms)" --argjson f "$freed" --argjson d "$after" '{id:$id, action:"prune", state:"done", at:$at, freedMb:$f, diskFreeMb:$d}' >"$UPD/.maint.tmp" && mv -f "$UPD/.maint.tmp" "$UPD/maint.json"
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

# Prompt 46: kjører et steg med run_watched; «Prøv igjen» (retry) kjører samme steg på nytt i samme jobb.
step_run() { # sekunder kommando…
  local rc
  while :; do
    run_watched "$@"; rc=$?
    if [ "$rc" = 130 ] && [ "$CTRL" = retry ]; then
      ATTEMPT=$(( ATTEMPT + 1 ))
      log "Prøver «$CUR_STEP» på nytt (forsøk $ATTEMPT)."
      set_state "$CUR_STATE" "$CUR_STEP"
      continue
    fi
    return "$rc"
  done
}
# Updateren skal aldri stoppe eller erstatte seg selv midt i en jobb.
no_self() { local x; for x in "$@"; do [ "$x" = updater ] && { log "Nekter å røre updater-tjenesten midt i en jobb."; return 1; }; done; return 0; }

run_job() {
  JOB_ID="$1"; STARTED=$(now_ms); FINISHED=""; SHA=""; VERSION=""; ACTION="${3:-update}"
  CUR_STATE=""; CUR_STEP=""; PROGRESS_S=""; LAST_LINE=""; STUCK_SINCE=""; CODE=""; DISK_MB=""; RAM_MB=""; ATTEMPT=1; CTRL=""
  local TARGET="${4:-}" RESTORE="${5:-}" FROM_SHA="" BACKUP="" RESTORED="" rc
  FROM_VERSION=""
  : >"$LOG"
  seed_history
  write_versions
  FROM_SHA=$(history_entries | jq -r '.[0].sha // empty'); FROM_VERSION=$(history_entries | jq -r '.[0].version // empty')
  if [ "$ACTION" = rollback ]; then
    log "Tilbakerulling $JOB_ID startet (forespurt av ${2:-ukjent}). Repo $UPDATE_REPO, prosjekt $PROJECT, mappe $HOST_DIR."
  else
    log "Oppdatering $JOB_ID startet (forespurt av ${2:-ukjent}). Repo $UPDATE_REPO, branch $UPDATE_BRANCH, prosjekt $PROJECT, mappe $HOST_DIR."
  fi
  # Prompt 46: nok disk og minne før noe lastes ned eller bygges.
  check_resources || return

  # 1. Last ned (rollback: forrige vellykkede sha fra historikken)
  if [ "$ACTION" = rollback ] && [ -n "$TARGET" ]; then
    # Prompt 44: målversjonen MÅ finnes i updaterens egen liste.
    set_state downloading "Laster ned $TARGET"
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
    set_state downloading "Laster ned forrige versjon"
    SHA=$(history_entries | jq -r '.[1].sha // empty')
    [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { SHA=""; fail "Fant ingen tidligere versjon å gå tilbake til."; return; }
    log "Går tilbake til $SHA"
  else
    set_state downloading "Laster ned siste versjon"
  fi
  TMPD=$(mktemp -d "${TMPDIR:-/tmp}/homelab-update.XXXXXX") || { fail "Kunne ikke lage midlertidig mappe."; return; }
  if [ "$ACTION" != rollback ]; then
  SHA=$(curl -fsSL --max-time 30 -H 'Accept: application/vnd.github+json' -H 'User-Agent: homelab-updater' \
    "https://api.github.com/repos/$UPDATE_REPO/commits/$UPDATE_BRANCH" 2>>"$LOG" | jq -r '.sha // empty' 2>>"$LOG")
  [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { SHA=""; fail "Fant ikke siste versjon på GitHub ($UPDATE_REPO, $UPDATE_BRANCH). Er repoet offentlig og nettet oppe?"; return; }
  log "Siste commit: $SHA"
  fi
  # Prompt 46: med tidsavbrudd og vakt (fremdrift = arkivet vokser); retry/abort virker her også.
  WATCH_FILE="$TMPD/src.tgz" step_run "$DOWNLOAD_TIMEOUT" curl -fsSL --max-time "$DOWNLOAD_TIMEOUT" -H 'User-Agent: homelab-updater' -o "$TMPD/src.tgz" \
    "https://codeload.github.com/$UPDATE_REPO/tar.gz/$SHA"; rc=$?
  case "$rc" in
    0) ;;
    130) fail_code cancelled "Avbrutt under nedlastingen. Ingenting er endret – ${FROM_VERSION:-forrige versjon} kjører som før."; return ;;
    124) fail_code timeout "Nedlastingen brukte mer enn $(( DOWNLOAD_TIMEOUT / 60 )) min og ble stoppet. Ingenting er endret."; return ;;
    *) fail_code network "Nedlastingen feilet. Ingenting er endret."; return ;;
  esac
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
  set_state building "Bygger ny versjon"
  compose_argv
  log "docker compose ${PROFILE[*]} build os"
  step_run "$BUILD_TIMEOUT" "${COMPOSE[@]}" build os; rc=$?
  if [ "$rc" != 0 ]; then
    local cause; cause=$(guess_cause)
    case "$rc" in
      130) fail_code cancelled "Avbrutt under byggingen. ${FROM_VERSION:-Den gamle versjonen} kjører som før (ingenting er startet på nytt)." ;;
      124) fail_code "${cause:-timeout}" "Bygget brukte mer enn $(( BUILD_TIMEOUT / 60 )) min og ble stoppet. Den gamle versjonen kjører videre (ingenting er startet på nytt).${cause:+ $(cause_text "$cause")}" ;;
      *) fail_code "${cause:-build}" "Bygget feilet. Den gamle versjonen kjører videre (ingenting er startet på nytt), men de nye filene er allerede kopiert inn i $HOST_DIR. Neste vellykkede oppdatering retter det.${cause:+ $(cause_text "$cause")}" ;;
    esac
    return
  fi

  # 4. Start på nytt (bare os og ev. cloudflared – aldri updater midt i jobben)
  set_state restarting "Starter på nytt"
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
  no_self "${services[@]}" || { fail "Intern feil: updateren skulle startes på nytt midt i jobben."; return; }
  log "docker compose ${PROFILE[*]} up -d --no-deps ${services[*]}"
  # Prompt 46: oppstarten har eget tidsavbrudd (UP_TIMEOUT). Feiler den, henger den eller avbrytes den, går vi tilbake som ved helsesjekken.
  local up_ok=1 why=""
  step_run "$UP_TIMEOUT" "${COMPOSE[@]}" up -d --no-deps "${services[@]}"; rc=$?
  case "$rc" in
    0) ;;
    130) up_ok=""; why="Avbrutt under omstarten"; CODE=cancelled ;;
    124) up_ok=""; why="Oppstarten brukte mer enn $UP_TIMEOUT sekunder"; CODE=timeout ;;
    *) up_ok=""; why="Kunne ikke starte den nye versjonen"; CODE=health ;;
  esac

  # 5. Vent på at den nye versjonen svarer (HEALTH_TIMEOUT, 90 s). Ellers: tilbake til versjonen vi kom fra.
  if [ -z "$up_ok" ] || ! wait_healthy; then
    if [ -n "$up_ok" ]; then
      why="Ny versjon startet ikke innen $HEALTH_TIMEOUT sekunder"; CODE=health
      [ "$ACTION" = rollback ] && why="Kunne ikke gå tilbake til ${TARGET:-${VERSION:-forrige versjon}} (svarte ikke innen $HEALTH_TIMEOUT sekunder)"
    fi
    if [[ "$FROM_SHA" =~ ^[0-9a-f]{40}$ ]] && [ "$FROM_SHA" != "$SHA" ]; then
      log "$why. Går automatisk tilbake til ${FROM_VERSION:-$FROM_SHA}."
      set_state restarting "Går tilbake til ${FROM_VERSION:-forrige versjon}"
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
  CODE=""

  FINISHED=$(now_ms); STUCK_SINCE=""
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
  # Prompt 45: migrering – Docker-tilgangen for Logger legges til hvis den mangler (ikke ved rollback; proxyen fjernes aldri).
  # Feil her stopper ikke oppdateringen: Logger viser «Sett opp nå» med feilen.
  [ "$ACTION" != rollback ] && { ensure_docker_proxy "$JOB_ID" || true; }

  # 6. Rydd, og oppdater til slutt updateren selv (ikke ved rollback: en eldre updater kjenner kanskje ikke historikken).
  timeout -k 10 "$PRUNE_TIMEOUT" docker image prune -f >>"$LOG" 2>&1 || true
  [ "$SELF_UPDATE" = 1 ] && [ "$ACTION" != rollback ] && self_update
  trim_log
  return 0
}

# ---------- Prompt 45: Docker-tilgang for Logger (homelab-docker) ----------
# Logger (Innstillinger → Server → Logger) trenger lesetilgang til Docker. Updateren legger proxyen til selv, fra SIN EGEN
# docker-compose.yml (den som ligger i HOST_DIR, kopiert inn fra arkivet updateren selv har lastet ned) – aldri fra serveren.
# Serveren kan bare be om {action:'docker-setup'} i request.json. Tjenesten valideres før den startes: fast versjonstag,
# POST=0 (bare ALLOW_START/STOP/RESTARTS), ingen EXEC/IMAGES/VOLUMES/NETWORKS/BUILD …, ingen porter, ikke privileged,
# bare docker.sock montert :ro. Finnes det allerede en proxy (brukerens egen, oppdaget på image-navnet), gjenbrukes den.
# Proxyen fjernes aldri (heller ikke ved rollback). Status: data/update/docker.json {id, state, at, error, proxy:{name, image, reused}}.
DOCKER_STATE="$UPD/docker.json"
PROXY_IMAGE_RE='^(docker\.io/)?(ghcr\.io/)?(lscr\.io/)?(tecnativa/docker-socket-proxy|linuxserver/socket-proxy)(:[A-Za-z0-9._-]+)?(@sha256:[0-9a-f]{64})?$'
DOCKER_JOB=""
write_docker_state() { # state [feil] [navn] [image] [gjenbrukt 0|1]
  jq -n --arg id "$DOCKER_JOB" --arg state "$1" --arg error "${2:-}" --arg name "${3:-}" --arg image "${4:-}" --arg reused "${5:-0}" --argjson at "$(now_ms)" \
    '{id:(if $id=="" then null else $id end), state:$state, at:$at, error:(if $error=="" then null else $error end),
      proxy:(if $name=="" then null else {name:$name, image:$image, reused:($reused=="1")} end)}' >"$UPD/.docker.tmp" 2>/dev/null \
    && mv -f "$UPD/.docker.tmp" "$DOCKER_STATE"
}
# Første proxy som ikke er vår egen: «navn<TAB>image<TAB>state», eller tomt.
find_existing_proxy() {
  local n img st
  while IFS=$'\t' read -r n img st; do
    [ -n "$n" ] || continue
    [ "$n" = homelab-docker ] && continue
    if [[ "$img" =~ $PROXY_IMAGE_RE ]]; then printf '%s\t%s\t%s\n' "$n" "$img" "$st"; return 0; fi
  done < <(docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.State}}' 2>/dev/null)
  return 0
}
# Er homelab-docker-tjenesten i vår egen compose trygg? Skriver feilen på stdout og returnerer 1 hvis ikke.
validate_proxy_compose() {
  local j
  j=$(compose config --format json 2>>"$LOG") || { echo "Kunne ikke lese docker-compose.yml"; return 1; }
  printf '%s' "$j" | jq -e '.services["homelab-docker"] != null' >/dev/null 2>&1 || { echo "docker-compose.yml mangler tjenesten homelab-docker"; return 1; }
  printf '%s' "$j" | jq -e '
    .services["homelab-docker"] as $s
    | (($s.image // "") | test("^tecnativa/docker-socket-proxy:[0-9]+\\.[0-9]+\\.[0-9]+$"))
    and (($s.ports // []) | length == 0)
    and (($s.privileged // false) == false)
    and (($s.network_mode // "") == "")
    and (($s.pid // "") == "")
    and (($s.cap_add // []) | length == 0)
    and (($s.environment // {}) as $e | (($e.POST // "") | tostring) == "0"
         and ([$e.EXEC, $e.IMAGES, $e.VOLUMES, $e.NETWORKS, $e.BUILD, $e.COMMIT, $e.SWARM, $e.SERVICES, $e.TASKS, $e.NODES, $e.SECRETS, $e.CONFIGS,
               $e.PLUGINS, $e.AUTH, $e.DISTRIBUTION, $e.SESSION, $e.GRPC, $e.ALLOW_ALL] | map((. // "0") | tostring) | all(. == "0")))
    and (($s.volumes // []) | length == 1 and (.[0] | ((.source // "") == "/var/run/docker.sock" and (.target // "") == "/var/run/docker.sock" and .read_only == true)))
  ' >/dev/null 2>&1 || { echo "homelab-docker i docker-compose.yml er ikke godkjent (krever fast versjonstag, POST=0, ingen porter og docker.sock :ro). Ingenting er startet."; return 1; }
  return 0
}
# Sørger for at os og en gjenbrukt proxy deler et nett (ellers kobles proxyen til os sitt nett).
connect_proxy() {
  local name="$1" os_id nets pnets n
  os_id=$(compose ps -q os 2>/dev/null | head -n 1)
  [[ "$os_id" =~ ^[0-9a-f]{12,64}$ ]] || return 0
  nets=$(docker inspect --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$os_id" 2>/dev/null || true)
  pnets=$(docker inspect --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$name" 2>/dev/null || true)
  for n in $nets; do case " $pnets " in *" $n "*) return 0 ;; esac; done
  for n in $nets; do
    [[ "$n" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]] || continue
    if docker network connect "$n" "$name" >>"$LOG" 2>&1; then log "Docker-tilgang: koblet $name til nettet $n."; return 0; fi
  done
  return 0
}
ensure_docker_proxy() { # [jobb-id]
  DOCKER_JOB="${1:-}"
  write_docker_state running
  log "Docker-tilgang: sjekker proxyen for Logger …"
  local ex name img st why
  ex=$(find_existing_proxy)
  if [ -n "$ex" ]; then
    IFS=$'\t' read -r name img st <<<"$ex"
    if [[ ! "$name" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]]; then write_docker_state failed "Fant en proxy med ugyldig navn"; return 1; fi
    if [ "$st" != running ]; then docker start "$name" >>"$LOG" 2>&1 || log "Docker-tilgang: klarte ikke å starte $name."; fi
    connect_proxy "$name"
    log "Docker-tilgang: gjenbruker $name ($img). Ingen ny proxy lages."
    write_docker_state done "" "$name" "$img" 1
    return 0
  fi
  if ! why=$(validate_proxy_compose); then
    log "Docker-tilgang: $why"
    write_docker_state failed "$why"
    return 1
  fi
  img=$(compose config --format json 2>/dev/null | jq -r '.services["homelab-docker"].image // empty' 2>/dev/null)
  log "docker compose up -d --no-deps homelab-docker"
  if ! compose up -d --no-deps homelab-docker >>"$LOG" 2>&1; then
    write_docker_state failed "Kunne ikke starte homelab-docker. Se loggen (docker compose logs homelab-docker)."
    return 1
  fi
  log "Docker-tilgang: homelab-docker kjører ($img). Logger virker uten ekstra oppsett."
  write_docker_state done "" homelab-docker "${img:-tecnativa/docker-socket-proxy}" 0
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
  curl -fsSL --max-time "$DOWNLOAD_TIMEOUT" -H 'User-Agent: homelab-updater' -o "$d/src.tgz" "https://codeload.github.com/$UPDATE_REPO/tar.gz/$sha" 2>>"$LOG" || { rm -rf "$d"; return 1; }
  mkdir "$d/src" && tar -xzf "$d/src.tgz" -C "$d/src" --strip-components=1 --no-same-owner 2>>"$LOG" || { rm -rf "$d"; return 1; }
  [ -f "$d/src/docker-compose.yml" ] && [ -f "$d/src/server/index.js" ] || { rm -rf "$d"; return 1; }
  rm -rf "$d/src/.env" "$d/src/data" "$d/src/proton"
  if command -v rsync >/dev/null 2>&1; then rsync -a --exclude '/.env' --exclude '/data/' --exclude '/proton/' "$d/src/" "$HOST_DIR/" >>"$LOG" 2>&1 || { rm -rf "$d"; return 1; }
  else cp -a "$d/src/." "$HOST_DIR/" >>"$LOG" 2>&1 || { rm -rf "$d"; return 1; }; fi
  rm -rf "$d"
  compose_argv
  timeout -k 20 "$BUILD_TIMEOUT" "${COMPOSE[@]}" build os >>"$LOG" 2>&1 || return 1
  local services=(os); [ "${#PROFILE[@]}" -gt 0 ] && services=(os cloudflared)
  timeout -k 20 "$UP_TIMEOUT" "${COMPOSE[@]}" up -d --no-deps "${services[@]}" >>"$LOG" 2>&1 || return 1
  return 0
}

# Updateren kan ikke gjenskape sin egen container (compose ville drept prosessen midt i). Bildet bygges her, og en
# kortlivet hjelpecontainer utenfor compose-prosjektet kjører «up -d --no-deps updater». Status er allerede «done».
self_update() {
  log "Oppdaterer updateren selv …"
  compose_argv
  if ! timeout -k 20 "$BUILD_TIMEOUT" "${COMPOSE[@]}" build updater >>"$LOG" 2>&1; then log "Klarte ikke å bygge updateren (ikke kritisk, den gamle kjører videre)."; return 0; fi
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

# Prompt 46: låsen er en FIL med «PID tid». Den gamle mappe-låsen ble liggende i containerens /tmp etter en hard omstart
# (OOM, LXC-omstart), og da døde den nye updateren i en omstartsløkke i opptil en time. Nå ryddes låsen når prosessen ikke
# lever (eller er oss selv: PID 1 i en ny container), eller når den er eldre enn LOCK_MAX_AGE (hjerteslaget fornyer den).
LOCK="$LOCK_DIR/homelab-updater.lock"
[ -d "$LOCK" ] && { say "Rydder gammel mappe-lås fra en eldre updater."; rm -rf "$LOCK"; }
write_lock() { printf '%s %s\n' "$$" "$(date +%s)" >"$LOCK.tmp.$$" && mv -f "$LOCK.tmp.$$" "$LOCK"; }
if [ -f "$LOCK" ]; then
  read -r lpid lat _ <"$LOCK" 2>/dev/null || true
  [[ "${lpid:-}" =~ ^[0-9]{1,10}$ ]] || lpid=""; [[ "${lat:-}" =~ ^[0-9]{1,12}$ ]] || lat=0
  lage=$(( $(date +%s) - lat ))
  if [ -n "$lpid" ] && [ "$lpid" != "$$" ] && kill -0 "$lpid" 2>/dev/null && [ "$lage" -lt "$LOCK_MAX_AGE" ]; then
    die "En annen updater kjører allerede (PID $lpid, $LOCK)."
  fi
  say "Rydder gammel lås (PID ${lpid:-?}, $lage s gammel, prosessen kjører ikke lenger)."
  rm -f "$LOCK"
fi
write_lock || die "Kan ikke skrive låsen $LOCK."
HB_PID=""
release_lock() { local p; read -r p _ <"$LOCK" 2>/dev/null || true; [ "${p:-}" = "$$" ] && rm -f "$LOCK"; }
trap 'release_lock; [ -n "$HB_PID" ] && kill "$HB_PID" 2>/dev/null; cleanup_tmp' EXIT
trap 'exit 0' INT TERM

# Hjerteslag også mens en jobb kjører (bygg kan ta minutter). Prompt 46: fornyer også låsen.
write_heartbeat
if [ -z "${ONCE:-}" ]; then ( while sleep "$INTERVAL"; do write_heartbeat; write_lock 2>/dev/null; done ) & HB_PID=$!; fi

LAST_ID=$(jq -r '.id // empty' "$UPD/status.json" 2>/dev/null || true)
# En jobb som var i gang da updateren stoppet (omstart av LXC-en e.l.) er avbrutt.
prev_state=$(jq -r '.state // empty' "$UPD/status.json" 2>/dev/null || true)
case "$prev_state" in downloading|building|restarting)
  JOB_ID="$LAST_ID"; STARTED=$(jq -r '.startedAt // empty' "$UPD/status.json"); FINISHED=$(now_ms)
  SHA=$(jq -r '.sha // empty' "$UPD/status.json"); VERSION=$(jq -r '.version // empty' "$UPD/status.json")
  ACTION=$(jq -r '(.action // "update") | strings' "$UPD/status.json" 2>/dev/null); case "$ACTION" in update|rollback) ;; *) ACTION=update ;; esac
  CODE=interrupted; FROM_VERSION=$(jq -r '.fromVersion // empty' "$UPD/status.json" 2>/dev/null || true)
  write_status failed "Avbrutt" "Oppdateringen ble avbrutt fordi updateren startet på nytt. Prøv igjen."
  CODE=""
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
        case "$act" in update|rollback|docker-setup|retry|abort|prune) ;; *) act="" ;; esac
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
        elif [ "$act" = abort ]; then
          say "Ingen jobb kjører – ingenting å avbryte ($id)."
        elif [ "$act" = prune ]; then
          say "Rydder gamle bilder ($id)."; run_prune "$id"; trim_log
        elif [ "$act" = docker-setup ]; then
          # Prompt 45: bare «sett opp Docker-tilgangen» – ingen nedlasting, ingen bygging, ingen omstart av os.
          if [ "$id" = "$(jq -r '.id // empty' "$DOCKER_STATE" 2>/dev/null)" ]; then say "Docker-oppsett $id er allerede kjørt.";
          else say "Setter opp Docker-tilgang ($id)."; if ensure_docker_proxy "$id"; then say "Docker-tilgang klar."; else say "Docker-oppsett feilet."; fi; trim_log; fi
        else
          # Prompt 46: «Prøv igjen» uten jobb som kjører = ny vanlig oppdatering (serveren sender aldri sha/repo).
          [ "$act" = retry ] && act=update
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
