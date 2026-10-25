#!/bin/bash
# fermion – installer Neutrino-1 8B (tekst) og Phonon (tale→tekst) fra Fermion Research på Mac mini-en. Prompt 53 (FERMION53).
#
#   ./install.sh                                  # begge: Neutrino på 10.69.1.173:8000, Phonon på 10.69.1.173:8010, tillater 10.69.1.39
#   ./install.sh --only neutrino                  # bare Neutrino (eller --only phonon)
#   ./install.sh --cache-dir /Volumes/AI/fermion  # modellene på den eksterne disken (som Ollama)
#   ./install.sh --phonon-model phonon-2          # Phonon-2 (engelsk) i stedet for Phonon-2.5 (25 språk, ikke norsk)
#   ./install.sh --rotate-key                     # ny nøkkel (oppdater Homelab etterpå)
#
# Lager venv i ~/Library/Application Support/fermion/venv, `pip install "fermion-research[mlx]==VERSJON"`, nøkkel og config.json (600),
# og LaunchAgentene com.local.fermion-neutrino og com.local.fermion-phonon. Hver agent kjører vakten (guard.py), som starter
# `fermion serve` på 127.0.0.1 og bare slipper inn Glimt-serveren (IP-liste + nøkkel) på Mac-ens LAN-adresse.
# Aldri eksponert via Cloudflare. Modellvektene lastes ned fra Hugging Face første gang tjenesten starter (Neutrino ~3,9 GB,
# Phonon ~160 MB). Kan kjøres på nytt: nøkkel, adresse og valg beholdes hvis du ikke gir nye. Fungerer med macOS sin bash 3.2.
set -euo pipefail

FERMION_VERSION_DEFAULT="0.2.15"   # fast versjon (sjekket 25.10.2026). Oppdater bevisst med --version.
DEFAULT_IP="10.69.1.173"
DEFAULT_ALLOW="10.69.1.39"
NEUTRINO_PORT=8000
PHONON_PORT=8010
NEUTRINO_UP=18000
PHONON_UP=18010

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$HOME/Library/Application Support/fermion"
VENV="$APP_DIR/venv"
CONFIG="$APP_DIR/config.json"
GUARD="$APP_DIR/guard.py"
LOG_DIR="$HOME/Library/Logs"

IP=""; ALLOW=""; ONLY=""; CACHE_DIR=""; PHONON_MODEL=""; SESSION_CTX=""; VERSION=""; ROTATE=0; PYTHON=""

die() { printf '\nFeil: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
warn() { printf '\nAdvarsel: %s\n\n' "$*" >&2; }

usage() {
  cat <<EOF
Bruk: ./install.sh [valg]

  --ip ADRESSE          Mac mini-ens LAN-adresse å lytte på (standard $DEFAULT_IP, eller den i config.json)
  --allow ADRESSE       Tillatt avsender (Glimt-serveren). Kan gjentas eller kommaseparert. Nett ned til /16. Standard $DEFAULT_ALLOW.
  --only TJENESTE       neutrino, phonon eller begge (standard: det som sto i config.json, ellers begge)
  --phonon-model NAVN   phonon-2.5 (standard, 25 språk – ikke norsk), phonon-2 eller phonon-2.5-en (engelsk)
  --session-ctx N       Neutrinos KV-kontekst (standard 4096; ~0,6 GB minne per 4096 med fp16). Mac mini-en deler 16 GB med Ollama.
  --cache-dir MAPPE     Hvor modellene lagres (FERMION_CACHE_DIR), f.eks. på den eksterne disken
  --python STI          Python 3.10+ å lage venv med (standard: python3.13/3.12/3.11/3.10 fra PATH eller Homebrew)
  --version X.Y.Z       fermion-research-versjon (standard $FERMION_VERSION_DEFAULT)
  --rotate-key          Lag ny nøkkel selv om det finnes en
  -h, --help            Denne hjelpen
EOF
}

is_ipv4() {
  local ip="$1" o
  [[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  for o in "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" "${BASH_REMATCH[4]}"; do [ "$((10#$o))" -le 255 ] || return 1; done
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

while [ $# -gt 0 ]; do
  case "$1" in
    --ip) [ $# -ge 2 ] || die "--ip trenger en adresse"; IP="$2"; shift 2 ;;
    --ip=*) IP="${1#*=}"; shift ;;
    --allow) [ $# -ge 2 ] || die "--allow trenger en adresse"; ALLOW="${ALLOW:+$ALLOW,}$2"; shift 2 ;;
    --allow=*) ALLOW="${ALLOW:+$ALLOW,}${1#*=}"; shift ;;
    --only) [ $# -ge 2 ] || die "--only trenger neutrino eller phonon"; ONLY="$2"; shift 2 ;;
    --only=*) ONLY="${1#*=}"; shift ;;
    --phonon-model) [ $# -ge 2 ] || die "--phonon-model trenger et navn"; PHONON_MODEL="$2"; shift 2 ;;
    --phonon-model=*) PHONON_MODEL="${1#*=}"; shift ;;
    --session-ctx) [ $# -ge 2 ] || die "--session-ctx trenger et tall"; SESSION_CTX="$2"; shift 2 ;;
    --session-ctx=*) SESSION_CTX="${1#*=}"; shift ;;
    --cache-dir) [ $# -ge 2 ] || die "--cache-dir trenger en mappe"; CACHE_DIR="$2"; shift 2 ;;
    --cache-dir=*) CACHE_DIR="${1#*=}"; shift ;;
    --python) [ $# -ge 2 ] || die "--python trenger en sti"; PYTHON="$2"; shift 2 ;;
    --version) [ $# -ge 2 ] || die "--version trenger X.Y.Z"; VERSION="$2"; shift 2 ;;
    --rotate-key) ROTATE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "Ukjent valg: $1" ;;
  esac
done

# --- Forutsetninger -----------------------------------------------------------
[ "$(uname -s)" = "Darwin" ] || die "Dette skriptet må kjøres på Mac mini-en (macOS)."
[ "$(id -u)" -ne 0 ] || die "Ikke kjør med sudo/root. Kjør som brukeren som er logget inn på Mac mini-en."
[ "$(uname -m)" = "arm64" ] || warn "Dette er ikke Apple silicon. Phonon kjører da på CPU-motoren, og Neutrino blir tregt."
command -v openssl >/dev/null 2>&1 || die "Fant ikke openssl."
[ -f "$SCRIPT_DIR/guard.py" ] || die "Fant ikke guard.py ved siden av install.sh."

case "$ONLY" in ""|neutrino|phonon|begge) ;; *) die "--only må være neutrino, phonon eller begge" ;; esac
case "$PHONON_MODEL" in ""|phonon-2.5|phonon-2|phonon-2.5-en) ;; *) die "--phonon-model må være phonon-2.5, phonon-2 eller phonon-2.5-en" ;; esac
[ -z "$SESSION_CTX" ] || [[ "$SESSION_CTX" =~ ^[0-9]{3,6}$ ]] || die "--session-ctx må være et tall (f.eks. 4096)"
[ -z "$VERSION" ] || [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "--version må være X.Y.Z"

py_ok() { "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; }
if [ -z "$PYTHON" ]; then
  for c in python3.13 python3.12 python3.11 python3.10 /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3; do
    if command -v "$c" >/dev/null 2>&1 && py_ok "$(command -v "$c")"; then PYTHON="$(command -v "$c")"; break; fi
  done
fi
[ -n "$PYTHON" ] || die "Fant ikke Python 3.10 eller nyere (macOS sin python3 er 3.9). Kjør: brew install python@3.12  – og så ./install.sh på nytt."
py_ok "$PYTHON" || die "$PYTHON er eldre enn Python 3.10."
info "Python: $("$PYTHON" --version 2>&1) ($PYTHON)"

mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents" "$LOG_DIR"
chmod 700 "$APP_DIR"

# --- venv og fermion-research ---------------------------------------------------
if [ ! -x "$VENV/bin/python" ]; then
  info "Lager venv i $VENV …"
  "$PYTHON" -m venv "$VENV"
fi
VPY="$VENV/bin/python"
[ -n "$VERSION" ] || VERSION="$("$VPY" -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get("fermion_version") or sys.argv[2])
except Exception: print(sys.argv[2])' "$CONFIG" "$FERMION_VERSION_DEFAULT")"
info "Installerer fermion-research[mlx]==$VERSION (kan ta noen minutter første gang: torch, transformers, mlx) …"
"$VPY" -m pip install --quiet --upgrade pip
if [ "$(uname -m)" = "arm64" ]; then
  "$VPY" -m pip install --quiet "fermion-research[mlx]==$VERSION"
else
  "$VPY" -m pip install --quiet "fermion-research==$VERSION"
fi
[ -x "$VENV/bin/fermion" ] || die "fermion ble ikke installert i $VENV/bin"
info "$("$VENV/bin/fermion" --version 2>/dev/null || echo fermion)"

cp "$SCRIPT_DIR/guard.py" "$GUARD.new"; chmod 600 "$GUARD.new"; mv -f "$GUARD.new" "$GUARD"

# --- Nøkkel og config.json (argumenter > eksisterende config.json > standard) --
NEW_KEY=0
if [ "$ROTATE" = 1 ]; then NEW_KEY=1; fi
KEY_IN=""
[ "$ROTATE" = 1 ] && KEY_IN="$(openssl rand -hex 32)"
(
  umask 077
  IP="$IP" ALLOW="$ALLOW" ONLY="$ONLY" CACHE_DIR="$CACHE_DIR" PHONON_MODEL="$PHONON_MODEL" SESSION_CTX="$SESSION_CTX" VERSION="$VERSION" \
  KEY_IN="$KEY_IN" NEW_RANDOM="$(openssl rand -hex 32)" DEFAULT_IP="$DEFAULT_IP" DEFAULT_ALLOW="$DEFAULT_ALLOW" VENV="$VENV" \
  NP="$NEUTRINO_PORT" PP="$PHONON_PORT" NU="$NEUTRINO_UP" PU="$PHONON_UP" \
  "$VPY" - "$CONFIG" <<'PY'
import ipaddress, json, os, sys
path = sys.argv[1]
try:
    cur = json.load(open(path))
except Exception:
    cur = {}
e = os.environ
key = e["KEY_IN"] or cur.get("key") or ""
new_key = False
if len(key) < 32:
    key, new_key = e["NEW_RANDOM"], True
ip = e["IP"] or cur.get("bind_ip") or e["DEFAULT_IP"]
ipaddress.IPv4Address(ip)
if ip == "0.0.0.0" or ip.startswith("127."):
    sys.exit("bind_ip må være Mac mini-ens LAN-adresse (ikke 0.0.0.0 eller 127.x)")
allow = [a for a in (e["ALLOW"].split(",") if e["ALLOW"] else cur.get("allow") or [e["DEFAULT_ALLOW"]]) if a]
for a in allow:
    if ipaddress.ip_network(a, strict=False).prefixlen < 16:
        sys.exit(f"--allow {a}: maks /16")
svcs = cur.get("services") or {}
n = dict(svcs.get("neutrino") or {})
n.setdefault("port", int(e["NP"])); n.setdefault("upstream_port", int(e["NU"])); n.setdefault("model", "neutrino-8b")
n["session_ctx"] = int(e["SESSION_CTX"]) if e["SESSION_CTX"] else int(n.get("session_ctx") or 4096)
p = dict(svcs.get("phonon") or {})
p.setdefault("port", int(e["PP"])); p.setdefault("upstream_port", int(e["PU"]))
p["model"] = e["PHONON_MODEL"] or p.get("model") or "phonon-2.5"
enabled = cur.get("enabled") or ["neutrino", "phonon"]
if e["ONLY"]:
    enabled = ["neutrino", "phonon"] if e["ONLY"] == "begge" else [e["ONLY"]]
out = {"bind_ip": ip, "allow": allow, "key": key, "venv": e["VENV"], "cache_dir": e["CACHE_DIR"] or cur.get("cache_dir") or "",
       "fermion_version": e["VERSION"], "enabled": enabled, "services": {"neutrino": n, "phonon": p}}
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(out, f, indent=2)
os.chmod(tmp, 0o600)
os.replace(tmp, path)
print("NEW_KEY" if new_key else "OLD_KEY")
PY
) > "$APP_DIR/.install-state" || die "Kunne ikke skrive config.json"
grep -q NEW_KEY "$APP_DIR/.install-state" && NEW_KEY=1
rm -f "$APP_DIR/.install-state"
for s in neutrino phonon; do "$VPY" "$GUARD" --config "$CONFIG" --service "$s" --check-config >/dev/null || die "config.json ble ikke godkjent ($s)."; done

cfg() { "$VPY" -c 'import json,sys; c=json.load(open(sys.argv[1])); v=c
for k in sys.argv[2].split("."): v=v[k]
print(",".join(v) if isinstance(v, list) else v)' "$CONFIG" "$1"; }
IP="$(cfg bind_ip)"; ALLOW_PRETTY="$(cfg allow)"; KEY="$(cfg key)"; ENABLED="$(cfg enabled)"; CACHE_DIR="$(cfg cache_dir)"
PHONON_MODEL="$(cfg services.phonon.model)"; NPORT="$(cfg services.neutrino.port)"; PPORT="$(cfg services.phonon.port)"
if [ -n "$CACHE_DIR" ]; then mkdir -p "$CACHE_DIR" || die "Kan ikke lage $CACHE_DIR (er disken montert?)"; fi

LOCAL_IPS="$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | tr '\n' ' ')"
# shellcheck disable=SC2086
if ! printf '%s\n' $LOCAL_IPS | grep -qxF "$IP"; then
  warn "Mac-en har ikke adressen $IP akkurat nå (adresser: ${LOCAL_IPS:-ingen}). Vakten prøver hvert 5. sekund til adressen
dukker opp. Sjekk den faste IP-en i UniFi, eller installer med --ip <adresse>."
fi

# --- LaunchAgents ------------------------------------------------------------------
xml_escape() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
UID_NUM="$(id -u)"
agent() {
  local svc="$1" label="com.local.fermion-$1" plist="$HOME/Library/LaunchAgents/com.local.fermion-$1.plist" log="$LOG_DIR/fermion-$1.log" d n
  for d in "gui/$UID_NUM" "user/$UID_NUM"; do
    if launchctl print "$d/$label" >/dev/null 2>&1; then
      info "Stopper $label ($d) …"
      launchctl bootout "$d/$label" 2>/dev/null || true
      n=0; while launchctl print "$d/$label" >/dev/null 2>&1 && [ "$n" -lt 20 ]; do sleep 0.5; n=$((n + 1)); done
    fi
  done
  case ",$ENABLED," in *",$svc,"*) ;; *) rm -f "$plist"; info "$label er ikke valgt (--only) · fjernet"; return 0 ;; esac
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$VPY")</string>
    <string>$(xml_escape "$GUARD")</string>
    <string>--config</string>
    <string>$(xml_escape "$CONFIG")</string>
    <string>--service</string>
    <string>$svc</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$log")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$log")</string>
</dict>
</plist>
EOF
  chmod 644 "$plist"
  /usr/bin/plutil -lint "$plist" >/dev/null || die "LaunchAgent-filen er ugyldig: $plist"
  local domain="gui/$UID_NUM"
  launchctl enable "$domain/$label" 2>/dev/null || true
  if ! launchctl bootstrap "$domain" "$plist" 2>/dev/null; then
    warn "Kunne ikke starte i $domain (ingen logget inn på skrivebordet?). Prøver user/$UID_NUM."
    domain="user/$UID_NUM"
    launchctl enable "$domain/$label" 2>/dev/null || true
    launchctl bootstrap "$domain" "$plist" || die "launchctl bootstrap feilet for $label. Se $log"
  fi
  launchctl kickstart "$domain/$label" >/dev/null 2>&1 || true
  info "LaunchAgent $label startet i $domain (logg: $log)"
}
agent neutrino
agent phonon

FW=/usr/libexec/ApplicationFirewall/socketfilterfw
if [ -x "$FW" ] && "$FW" --getglobalstate 2>/dev/null | grep -qE 'State = [12]'; then
  warn "macOS-brannmuren er på. Gi venv-ens Python lov til å ta imot tilkoblinger fra nettverket:
  sudo $FW --add \"$(readlink -f "$VPY" 2>/dev/null || echo "$VPY")\"
  sudo $FW --unblockapp \"$(readlink -f "$VPY" 2>/dev/null || echo "$VPY")\""
fi

SELF_N="-"; SELF_P="-"
sleep 2
case ",$ENABLED," in *",neutrino,"*) SELF_N="$(curl -s -o /dev/null -w '%{http_code}' -m 5 -H "Authorization: Bearer $KEY" "http://$IP:$NPORT/health" || true)" ;; esac
case ",$ENABLED," in *",phonon,"*) SELF_P="$(curl -s -o /dev/null -w '%{http_code}' -m 5 -H "Authorization: Bearer $KEY" "http://$IP:$PPORT/health" || true)" ;; esac

cat <<EOF

==================================================================================
 Fermion Research er installert (fermion-research $VERSION)
==================================================================================
 Tjenester:       $ENABLED
 Neutrino-1 8B:   http://$IP:$NPORT   (OpenAI-kompatibel chat)
 Phonon:          http://$IP:$PPORT   ($PHONON_MODEL, /v1/audio/transcriptions)
 Nøkkel:          $KEY$( [ "$NEW_KEY" = 1 ] && printf '   (NY)' )
 Tillatt fra:     $ALLOW_PRETTY
 Modeller:        ${CACHE_DIR:-~/.cache/huggingface (standard)}
 Konfig (600):    $CONFIG
 Logger:          $LOG_DIR/fermion-neutrino.log · $LOG_DIR/fermion-phonon.log
 Test fra Mac:    Neutrino HTTP $SELF_N · Phonon HTTP $SELF_P   (403 er riktig: Mac-en selv er ikke på tillatelseslista)

 Første start laster ned modellene fra Hugging Face (Neutrino ~3,9 GB, Phonon ~160 MB).
 Følg med:  tail -f "$LOG_DIR/fermion-neutrino.log"

 Legg inn i Homelab (admin): AI-kontroll › Mac mini · Fermion, eller fra Glimt-serveren:
   Neutrino-adresse:  http://$IP:$NPORT
   Phonon-adresse:    http://$IP:$PPORT
   Nøkkel (begge):    $KEY

 Test fra Glimt-serveren ($ALLOW_PRETTY):
   curl -sS -H "Authorization: Bearer $KEY" http://$IP:$NPORT/health      # {"status":"ok",…} (503 = starter fortsatt)
   curl -sS -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \\
     -d '{"messages":[{"role":"user","content":"Hei! Svar kort."}],"max_tokens":40}' http://$IP:$NPORT/v1/chat/completions
   curl -sS -H "Authorization: Bearer $KEY" -F file=@opptak.wav -F response_format=verbose_json http://$IP:$PPORT/v1/audio/transcriptions
   curl -sS -o /dev/null -w '%{http_code}\n' http://$IP:$NPORT/health      # uten nøkkel: 401

 Nøkkelen er hemmelig. Ikke lim den inn i chat, git eller logger.
==================================================================================
EOF
