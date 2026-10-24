#!/bin/bash
# vision-ocr – installer Apple Vision OCR-tjenesten på Mac mini-en med én kommando.
#
#   ./install.sh                         # standard: lytter på 10.69.1.173:8765, tillater 10.69.1.39
#   ./install.sh --ip 10.69.1.173 --allow 10.69.1.39
#   ./install.sh --rotate-key            # lag ny nøkkel (husk å oppdatere Homelab Innstillinger)
#
# Bygger (swift build -c release), installerer binæren i ~/Library/Application Support/vision-ocr/,
# lager nøkkel og config.json (600), skriver LaunchAgent com.local.vision-ocr og starter den.
# Kan kjøres på nytt: nøkkel, adresse og tillatelsesliste beholdes hvis du ikke gir nye.
# Fungerer med macOS sin bash 3.2.
set -euo pipefail

LABEL="com.local.vision-ocr"
DEFAULT_IP="10.69.1.173"
DEFAULT_ALLOW="10.69.1.39"
DEFAULT_PORT="8765"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$HOME/Library/Application Support/vision-ocr"
BIN="$APP_DIR/vision-ocr"
CONFIG="$APP_DIR/config.json"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/vision-ocr.log"
PLUTIL="${PLUTIL:-/usr/bin/plutil}"

IP=""
PORT=""
ALLOW=""
ROTATE=0
RUN_TESTS=0

die() { printf '\nFeil: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
warn() { printf '\nAdvarsel: %s\n\n' "$*" >&2; }

usage() {
  cat <<EOF
Bruk: ./install.sh [valg]

  --ip ADRESSE       Mac mini-ens LAN-adresse å lytte på (standard $DEFAULT_IP, eller den som står i config.json)
  --port PORT        Port (standard $DEFAULT_PORT)
  --allow ADRESSE    Tillatt avsender-IP (Glimt-serveren). Kan gjentas eller kommaseparert.
                     Nett er lov ned til /16, f.eks. 10.69.1.0/24. Standard $DEFAULT_ALLOW.
  --rotate-key       Lag ny nøkkel selv om det finnes en
  --test             Kjør swift test før installasjon
  -h, --help         Denne hjelpen
EOF
}

is_ipv4() {
  local ip="$1" o
  [[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  for o in "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" "${BASH_REMATCH[4]}"; do
    [ "$((10#$o))" -le 255 ] || return 1
  done
  return 0
}

is_allow_entry() {
  local e="$1" addr prefix
  addr="${e%%/*}"
  is_ipv4 "$addr" || return 1
  if [ "$addr" != "$e" ]; then
    prefix="${e#*/}"
    [[ "$prefix" =~ ^[0-9]{1,2}$ ]] || return 1
    [ "$((10#$prefix))" -ge 16 ] && [ "$((10#$prefix))" -le 32 ] || return 1
  fi
  return 0
}

# Leser en verdi fra config.json (tom streng hvis den mangler).
config_get() {
  local key="$1" fmt="${2:-raw}"
  [ -f "$CONFIG" ] || return 0
  "$PLUTIL" -extract "$key" "$fmt" -o - "$CONFIG" 2>/dev/null || true
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ip) [ $# -ge 2 ] || die "--ip trenger en adresse"; IP="$2"; shift 2 ;;
    --ip=*) IP="${1#*=}"; shift ;;
    --port) [ $# -ge 2 ] || die "--port trenger et tall"; PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    --allow) [ $# -ge 2 ] || die "--allow trenger en adresse"; ALLOW="${ALLOW:+$ALLOW,}$2"; shift 2 ;;
    --allow=*) ALLOW="${ALLOW:+$ALLOW,}${1#*=}"; shift ;;
    --rotate-key) ROTATE=1; shift ;;
    --test) RUN_TESTS=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "Ukjent valg: $1" ;;
  esac
done

# --- Forutsetninger -----------------------------------------------------------
[ "$(uname -s)" = "Darwin" ] || die "Dette skriptet må kjøres på Mac mini-en (macOS)."
[ "$(id -u)" -ne 0 ] || die "Ikke kjør med sudo/root. Kjør som brukeren som er logget inn på Mac mini-en."

MACOS_VERSION="$(sw_vers -productVersion)"
MACOS_MAJOR="${MACOS_VERSION%%.*}"
[ "$MACOS_MAJOR" -ge 14 ] 2>/dev/null || die "Krever macOS 14 (Sonoma) eller nyere. Denne Mac-en har $MACOS_VERSION."

if ! xcode-select -p >/dev/null 2>&1; then
  die "Xcode Command Line Tools mangler. Kjør: xcode-select --install  – og så ./install.sh på nytt."
fi
command -v swift >/dev/null 2>&1 || die "Fant ikke swift. Kjør: xcode-select --install"
command -v openssl >/dev/null 2>&1 || die "Fant ikke openssl."
info "Swift: $(swift --version 2>/dev/null | head -n 1)"

# --- Innstillinger (argumenter > eksisterende config.json > standard) --------
[ -n "$IP" ] || IP="$(config_get bind_ip)"
[ -n "$IP" ] || IP="$DEFAULT_IP"
[ -n "$PORT" ] || PORT="$(config_get port)"
[ -n "$PORT" ] || PORT="$DEFAULT_PORT"
if [ -z "$ALLOW" ]; then
  ALLOW="$(config_get allow json | tr -d '[]" \n\t')"
fi
[ -n "$ALLOW" ] || ALLOW="$DEFAULT_ALLOW"

is_ipv4 "$IP" || die "Ugyldig --ip: $IP"
case "$IP" in
  0.0.0.0) die "Tjenesten skal ikke lytte på 0.0.0.0. Bruk Mac mini-ens LAN-adresse (standard $DEFAULT_IP)." ;;
  127.*) die "127.x kan ikke nås fra Glimt-serveren. Bruk Mac mini-ens LAN-adresse (standard $DEFAULT_IP)." ;;
esac
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] && [ "$((10#$PORT))" -ge 1 ] && [ "$((10#$PORT))" -le 65535 ] || die "Ugyldig --port: $PORT"
PORT="$((10#$PORT))"

ALLOW_JSON=""
OLD_IFS="$IFS"; IFS=','
# shellcheck disable=SC2086 # deles på komma (IFS)
for entry in $ALLOW; do
  [ -n "$entry" ] || continue
  is_allow_entry "$entry" || { IFS="$OLD_IFS"; die "Ugyldig --allow: $entry (bruk IPv4, eller nett med minst /16)"; }
  ALLOW_JSON="${ALLOW_JSON:+$ALLOW_JSON, }\"$entry\""
done
IFS="$OLD_IFS"
[ -n "$ALLOW_JSON" ] || die "Tillatelseslista er tom."
ALLOW_PRETTY="$(printf '%s' "$ALLOW_JSON" | tr -d '"')"

LOCAL_IPS="$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | tr '\n' ' ')"
# shellcheck disable=SC2086 # orddeling er meningen her
if ! printf '%s\n' $LOCAL_IPS | grep -qxF "$IP"; then
  warn "Mac-en har ikke adressen $IP akkurat nå (adresser: ${LOCAL_IPS:-ingen}).
Tjenesten prøver å lytte hvert 5. sekund til adressen dukker opp. Sjekk den faste
IP-en i UniFi, eller installer med --ip <adresse>."
fi

# --- Bygg ---------------------------------------------------------------------
info "Bygger (swift build -c release) …"
swift build -c release --package-path "$SCRIPT_DIR"
BUILD_DIR="$(swift build -c release --package-path "$SCRIPT_DIR" --show-bin-path)"
[ -x "$BUILD_DIR/vision-ocr" ] || die "Fant ikke den bygde binæren i $BUILD_DIR"

if [ "$RUN_TESTS" = 1 ]; then
  info "Kjører swift test …"
  swift test --package-path "$SCRIPT_DIR"
fi

# --- Installer binæren ------------------------------------------------------------
mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
chmod 700 "$APP_DIR"
# Kopier til ny fil og flytt på plass (ny inode). Å skrive over en kjørende, signert binær
# kan få macOS til å drepe den nye prosessen («Code Signature Invalid»).
cp "$BUILD_DIR/vision-ocr" "$APP_DIR/vision-ocr.new"
chmod 755 "$APP_DIR/vision-ocr.new"
mv -f "$APP_DIR/vision-ocr.new" "$BIN"
info "Installert: $BIN"

# --- Nøkkel og config.json ------------------------------------------------------
KEY=""
NEW_KEY=0
if [ "$ROTATE" = 0 ]; then KEY="$(config_get key)"; fi
if [ "${#KEY}" -lt 32 ]; then
  KEY="$(openssl rand -hex 32)"
  NEW_KEY=1
fi

EXTRA=""
LANGS_JSON="$(config_get languages json | tr -d '\n')"
[ -z "$LANGS_JSON" ] || EXTRA="$EXTRA,
  \"languages\": $LANGS_JSON"
LANG_CORR="$(config_get language_correction)"
case "$LANG_CORR" in true|false) EXTRA="$EXTRA,
  \"language_correction\": $LANG_CORR" ;; esac
for k in max_bytes timeout_seconds max_connections; do
  v="$(config_get "$k")"
  if [[ "$v" =~ ^[0-9]+$ ]]; then EXTRA="$EXTRA,
  \"$k\": $v"; fi
done

(
  umask 077
  cat > "$CONFIG.tmp" <<EOF
{
  "bind_ip": "$IP",
  "port": $PORT,
  "key": "$KEY",
  "allow": [$ALLOW_JSON]$EXTRA
}
EOF
)
chmod 600 "$CONFIG.tmp"
mv -f "$CONFIG.tmp" "$CONFIG"
"$BIN" --check-config --config "$CONFIG" || die "config.json ble ikke godkjent."

# --- LaunchAgent ----------------------------------------------------------------
xml_escape() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
BIN_X="$(xml_escape "$BIN")"
CONFIG_X="$(xml_escape "$CONFIG")"
LOG_X="$(xml_escape "$LOG")"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN_X</string>
    <string>--config</string>
    <string>$CONFIG_X</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>$LOG_X</string>
  <key>StandardErrorPath</key>
  <string>$LOG_X</string>
</dict>
</plist>
EOF
chmod 644 "$PLIST"
"$PLUTIL" -lint "$PLIST" >/dev/null || die "LaunchAgent-filen er ugyldig: $PLIST"

UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"
for d in "gui/$UID_NUM" "user/$UID_NUM"; do
  if launchctl print "$d/$LABEL" >/dev/null 2>&1; then
    info "Stopper kjørende tjeneste ($d) …"
    launchctl bootout "$d/$LABEL" 2>/dev/null || true
    n=0
    while launchctl print "$d/$LABEL" >/dev/null 2>&1 && [ "$n" -lt 20 ]; do sleep 0.5; n=$((n + 1)); done
  fi
done

launchctl enable "$DOMAIN/$LABEL" 2>/dev/null || true
if ! launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null; then
  warn "Kunne ikke starte i $DOMAIN (er ingen logget inn på skrivebordet, f.eks. bare SSH?).
Prøver user/$UID_NUM. Slå på automatisk innlogging så tjenesten starter etter omstart (se README)."
  DOMAIN="user/$UID_NUM"
  launchctl enable "$DOMAIN/$LABEL" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$PLIST" || die "launchctl bootstrap feilet. Se $LOG"
fi
launchctl kickstart "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
info "LaunchAgent $LABEL startet i $DOMAIN"

# --- Sjekk at den lytter ----------------------------------------------------------
LISTENING=0
n=0
while [ "$n" -lt 20 ]; do
  if lsof -nP -iTCP@"$IP":"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then LISTENING=1; break; fi
  sleep 0.5
  n=$((n + 1))
done
SELF_CODE="000"
if [ "$LISTENING" = 1 ]; then
  # Fra Mac-en selv er avsender $IP, som ikke står på lista: 403 betyr at IP-filteret virker.
  SELF_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 5 -H "Authorization: Bearer $KEY" "http://$IP:$PORT/health" || true)"
else
  warn "Tjenesten lytter ikke på $IP:$PORT ennå. Se loggen: tail -n 50 \"$LOG\""
fi

FW=/usr/libexec/ApplicationFirewall/socketfilterfw
if [ -x "$FW" ] && "$FW" --getglobalstate 2>/dev/null | grep -qE 'State = [12]'; then
  warn "macOS-brannmuren er på. Gi vision-ocr lov til å ta imot tilkoblinger fra nettverket:
  sudo $FW --add \"$BIN\"
  sudo $FW --unblockapp \"$BIN\""
fi

# --- Oppsummering -----------------------------------------------------------------
URL="http://$IP:$PORT"
cat <<EOF

==================================================================================
 vision-ocr er installert
==================================================================================
 Adresse:        $URL
 Nøkkel:         $KEY$( [ "$NEW_KEY" = 1 ] && printf '   (NY)' )
 Tillatt fra:    $ALLOW_PRETTY
 Binær:          $BIN
 Konfig (600):   $CONFIG
 LaunchAgent:    $PLIST
 Logg:           $LOG
 Lytter:         $( [ "$LISTENING" = 1 ] && printf 'ja' || printf 'NEI – se loggen' )
 Test fra Mac:   HTTP $SELF_CODE $( [ "$SELF_CODE" = 403 ] && printf '(riktig: Mac-en selv er ikke på tillatelseslista)' )

 Språk:
$("$BIN" --print-languages --config "$CONFIG" 2>/dev/null | sed 's/^/   /')

 Legg inn i Homelab › Innstillinger (admin), Mac-OCR:
   Adresse (macOcrUrl):  $URL
   Nøkkel  (macOcrKey):  $KEY

 Test fra Glimt-serveren ($ALLOW_PRETTY), f.eks. i LXC-en med ssh:

   # 1) Helse (skal gi {"ok":true,...})
   curl -sS -H "Authorization: Bearer $KEY" $URL/health

   # 2) OCR av en kvittering (multipart, feltet image)
   curl -sS -H "Authorization: Bearer $KEY" -F "image=@kvittering.jpg" $URL/ocr

   # 3) Samme som JSON med base64
   printf '{"image_base64":"%s"}' "\$(base64 -w0 kvittering.jpg)" | \\
     curl -sS -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" --data-binary @- $URL/ocr

   # 4) Uten nøkkel (skal gi 401)
   curl -sS -o /dev/null -w '%{http_code}\n' $URL/health

   # Fra Glimt-containeren (har node, ikke nødvendigvis curl):
   docker exec <glimt-container> node -e "fetch('$URL/health',{headers:{authorization:'Bearer $KEY'}}).then(r=>r.text()).then(console.log)"

 Nøkkelen er hemmelig. Ikke lim den inn i chat, git eller logger.
==================================================================================
EOF
