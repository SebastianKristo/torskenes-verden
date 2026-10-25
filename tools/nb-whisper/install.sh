#!/bin/bash
# nb-whisper – installer NB-Whisper (Nasjonalbiblioteket, Apache-2.0) som tale til tekst på Mac mini-en. Prompt 54 (WHISPER54).
#
#   ./install.sh                                    # modell etter minnet (16 GB → medium, 24 GB+ → large), MLX, 10.69.1.173:8020
#   ./install.sh --model large                      # NB-Whisper large (~3 GB i minnet) – eller medium/small
#   ./install.sh --engine cpp                       # whisper.cpp med Metal i stedet for MLX
#   ./install.sh --cache-dir /Volumes/AI/nb-whisper # modellen på den eksterne disken
#   ./install.sh --rotate-key                       # ny nøkkel (legg den inn i Homelab etterpå)
#
# MLX (Apple silicon, Metal) er standard: ferdige MLX-vekter brukes hvis de finnes på Hugging Face, ellers konverteres
# NbAiLab/nb-whisper-<størrelse> til MLX her på Mac-en (prepare.py). Går ikke det, brukes whisper.cpp med Metal
# (ggml-model.bin fra samme repo, `brew install whisper-cpp`). Vektene lastes ned NÅ (ikke ved første forespørsel).
# Tjenesten (nbwhisper.py) lytter bare på Mac-ens LAN-adresse, slipper bare inn Glimt-serveren (IP-liste + nøkkel) og kjører
# uten nett (HF_HUB_OFFLINE=1). Aldri eksponert via Cloudflare. Kan kjøres på nytt: nøkkel, adresse og valg beholdes.
# Fungerer med macOS sin bash 3.2.
set -euo pipefail

MLX_WHISPER_VERSION="0.4.3"   # fast versjon (sjekket 25.10.2026)
MLX_VERSION="0.32.4"
DEFAULT_IP="10.69.1.173"
DEFAULT_ALLOW="10.69.1.39"
PORT_DEFAULT=8020
UPSTREAM_PORT=18020           # whisper.cpp (bare 127.0.0.1)
LABEL="com.local.nb-whisper"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$HOME/Library/Application Support/nb-whisper"
VENV="$APP_DIR/venv"
CONFIG="$APP_DIR/config.json"
SERVICE="$APP_DIR/nbwhisper.py"
LOG_DIR="$HOME/Library/Logs"
LOG="$LOG_DIR/nb-whisper.log"

IP=""; ALLOW=""; MODEL=""; ENGINE=""; CACHE_DIR=""; PORT=""; PYTHON=""; ROTATE=0; REFRESH=0

die() { printf '\nFeil: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
warn() { printf '\nAdvarsel: %s\n\n' "$*" >&2; }

usage() {
  cat <<EOF
Bruk: ./install.sh [valg]

  --ip ADRESSE        Mac mini-ens LAN-adresse å lytte på (standard $DEFAULT_IP, eller den i config.json)
  --allow ADRESSE     Tillatt avsender (Glimt-serveren). Kan gjentas eller kommaseparert. Nett ned til /16. Standard $DEFAULT_ALLOW.
  --model STØRRELSE   large, medium, small, base, tiny eller auto (standard auto: medium på 16 GB fordi qwen3:8b skal kunne
                      ligge lastet i Ollama samtidig, large fra 24 GB). NB-Whisper large bruker ~3 GB, medium ~1,5 GB.
  --engine MOTOR      auto (standard: MLX, ellers whisper.cpp), mlx eller cpp
  --port PORT         Porten på LAN-adressen (standard $PORT_DEFAULT)
  --cache-dir MAPPE   Hvor modellen lagres (standard: $APP_DIR/models), f.eks. på den eksterne disken
  --python STI        Python 3.10+ å lage venv med (standard: python3.13/3.12/3.11/3.10 fra PATH eller Homebrew)
  --refresh-model     Last ned og klargjør modellen på nytt selv om den finnes
  --rotate-key        Lag ny nøkkel selv om det finnes en
  -h, --help          Denne hjelpen
EOF
}

is_ipv4() {
  local ip="$1" o
  [[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  for o in "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" "${BASH_REMATCH[4]}"; do [ "$((10#$o))" -le 255 ] || return 1; done
  return 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ip) [ $# -ge 2 ] || die "--ip trenger en adresse"; IP="$2"; shift 2 ;;
    --ip=*) IP="${1#*=}"; shift ;;
    --allow) [ $# -ge 2 ] || die "--allow trenger en adresse"; ALLOW="${ALLOW:+$ALLOW,}$2"; shift 2 ;;
    --allow=*) ALLOW="${ALLOW:+$ALLOW,}${1#*=}"; shift ;;
    --model) [ $# -ge 2 ] || die "--model trenger en størrelse"; MODEL="$2"; shift 2 ;;
    --model=*) MODEL="${1#*=}"; shift ;;
    --engine) [ $# -ge 2 ] || die "--engine trenger auto, mlx eller cpp"; ENGINE="$2"; shift 2 ;;
    --engine=*) ENGINE="${1#*=}"; shift ;;
    --port) [ $# -ge 2 ] || die "--port trenger et tall"; PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    --cache-dir) [ $# -ge 2 ] || die "--cache-dir trenger en mappe"; CACHE_DIR="$2"; shift 2 ;;
    --cache-dir=*) CACHE_DIR="${1#*=}"; shift ;;
    --python) [ $# -ge 2 ] || die "--python trenger en sti"; PYTHON="$2"; shift 2 ;;
    --refresh-model) REFRESH=1; shift ;;
    --rotate-key) ROTATE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "Ukjent valg: $1" ;;
  esac
done

# --- Forutsetninger -----------------------------------------------------------
[ "$(uname -s)" = "Darwin" ] || die "Dette skriptet må kjøres på Mac mini-en (macOS)."
[ "$(id -u)" -ne 0 ] || die "Ikke kjør med sudo/root. Kjør som brukeren som er logget inn på Mac mini-en."
ARCH="$(uname -m)"
command -v openssl >/dev/null 2>&1 || die "Fant ikke openssl."
command -v curl >/dev/null 2>&1 || die "Fant ikke curl."
for f in nbwhisper.py prepare.py; do [ -f "$SCRIPT_DIR/$f" ] || die "Fant ikke $f ved siden av install.sh."; done
case "$MODEL" in ""|auto|large|medium|small|base|tiny) ;; *) die "--model må være large, medium, small, base, tiny eller auto" ;; esac
case "$ENGINE" in ""|auto|mlx|cpp) ;; *) die "--engine må være auto, mlx eller cpp" ;; esac
[ -z "$PORT" ] || [[ "$PORT" =~ ^[0-9]{4,5}$ ]] || die "--port må være et tall (f.eks. 8020)"
[ -z "$IP" ] || is_ipv4 "$IP" || die "--ip må være en IPv4-adresse"

py_ok() { "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; }
if [ -z "$PYTHON" ]; then
  for c in python3.13 python3.12 python3.11 python3.10 /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3; do
    if command -v "$c" >/dev/null 2>&1 && py_ok "$(command -v "$c")"; then PYTHON="$(command -v "$c")"; break; fi
  done
fi
[ -n "$PYTHON" ] || die "Fant ikke Python 3.10 eller nyere (macOS sin python3 er 3.9). Kjør: brew install python@3.12  – og så ./install.sh på nytt."
py_ok "$PYTHON" || die "$PYTHON er eldre enn Python 3.10."
info "Python: $("$PYTHON" --version 2>&1) ($PYTHON)"

# Eksisterende valg (config.json) beholdes når de ikke gis på nytt.
prev() { [ -f "$CONFIG" ] && "$PYTHON" -c 'import json,sys
try: v=json.load(open(sys.argv[1])).get(sys.argv[2]); print(v if v is not None else "")
except Exception: print("")' "$CONFIG" "$1" 2>/dev/null || true; }
[ -n "$MODEL" ] || MODEL="$(prev size_choice)"
[ -n "$ENGINE" ] || ENGINE="$(prev engine_choice)"
[ -n "$CACHE_DIR" ] || CACHE_DIR="$(prev cache_dir)"
[ -n "$MODEL" ] || MODEL="auto"
[ -n "$ENGINE" ] || ENGINE="auto"

MEM_BYTES="$(sysctl -n hw.memsize 2>/dev/null || echo 0)"
MEM_GB=$(( MEM_BYTES / 1073741824 ))
SIZE="$MODEL"
if [ "$MODEL" = "auto" ]; then
  if [ "$MEM_GB" -ge 24 ]; then SIZE="large"; else SIZE="medium"; fi
  info "Minne: ${MEM_GB} GB → NB-Whisper $SIZE (velg selv med --model)"
elif [ "$MODEL" = "large" ] && [ "$MEM_GB" -gt 0 ] && [ "$MEM_GB" -lt 24 ]; then
  warn "NB-Whisper large bruker ~3 GB. Med ${MEM_GB} GB og qwen3:8b lastet i Ollama kan Mac-en begynne å swappe. Medium er anbefalt."
fi
if [ "$ARCH" != "arm64" ] && [ "$ENGINE" != "cpp" ]; then
  warn "Dette er ikke Apple silicon – MLX virker ikke. Bruker whisper.cpp."
  ENGINE="cpp"
fi


mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents" "$LOG_DIR"
chmod 700 "$APP_DIR"
MODELS_ROOT="${CACHE_DIR:-$APP_DIR/models}"
mkdir -p "$MODELS_ROOT" || die "Kan ikke lage $MODELS_ROOT (er disken montert?)"
export HF_HOME="$MODELS_ROOT/huggingface"
export HF_HUB_DISABLE_TELEMETRY=1

# --- venv og pakker ------------------------------------------------------------
if [ ! -x "$VENV/bin/python" ]; then
  info "Lager venv i $VENV …"
  "$PYTHON" -m venv "$VENV"
fi
VPY="$VENV/bin/python"
"$VPY" -m pip install --quiet --upgrade pip
info "Installerer huggingface_hub og numpy …"
"$VPY" -m pip install --quiet "huggingface_hub>=0.23" "numpy>=1.26"
if [ "$ENGINE" != "cpp" ]; then
  # mlx-whisper krever torch i metadataen, men bruker den bare til et eksempel. Uten --no-deps ville vi lastet ned ~2 GB unødvendig.
  info "Installerer mlx==$MLX_VERSION og mlx-whisper==$MLX_WHISPER_VERSION (Metal) …"
  "$VPY" -m pip install --quiet "mlx==$MLX_VERSION" numba tiktoken scipy more-itertools tqdm
  "$VPY" -m pip install --quiet --no-deps "mlx-whisper==$MLX_WHISPER_VERSION"
  "$VPY" -c 'import mlx.core, mlx_whisper' || die "mlx-whisper ble ikke installert riktig"
fi
cp "$SCRIPT_DIR/nbwhisper.py" "$SERVICE.new"; chmod 600 "$SERVICE.new"; mv -f "$SERVICE.new" "$SERVICE"
cp "$SCRIPT_DIR/prepare.py" "$APP_DIR/prepare.py"; chmod 600 "$APP_DIR/prepare.py"

# --- Modellen (lastes ned nå) ----------------------------------------------------
MODEL_DIR="$MODELS_ROOT/nb-whisper-$SIZE"
have_model() { # → mlx | cpp | (tom)
  "$VPY" -c 'import json,os,sys
d=sys.argv[1]
try: m=json.load(open(os.path.join(d,"model.json")))
except Exception: sys.exit(0)
e=m.get("engine")
ok=(e=="mlx" and os.path.exists(os.path.join(d,"mlx","config.json")) and (os.path.exists(os.path.join(d,"mlx","weights.safetensors")) or os.path.exists(os.path.join(d,"mlx","weights.npz")))) or (e=="cpp" and os.path.exists(os.path.join(d,"ggml-model.bin")))
print(e if ok else "")' "$MODEL_DIR"
}
GOT="$(have_model)"
if [ "$REFRESH" = 1 ] || [ -z "$GOT" ] || { [ "$ENGINE" != "auto" ] && [ "$GOT" != "$ENGINE" ]; }; then
  [ "$REFRESH" = 1 ] && rm -rf "$MODEL_DIR"
  info "Henter NB-Whisper $SIZE fra Hugging Face (NbAiLab) – kan ta en stund (medium ~1,5 GB, large ~3 GB) …"
  if ! "$VPY" "$APP_DIR/prepare.py" --size "$SIZE" --engine "$ENGINE" --out "$MODEL_DIR"; then
    [ "$ENGINE" = "auto" ] || die "Kunne ikke klargjøre NB-Whisper $SIZE med $ENGINE (se feilen over)."
    warn "MLX-sporet feilet – prøver whisper.cpp."
    "$VPY" "$APP_DIR/prepare.py" --size "$SIZE" --engine cpp --out "$MODEL_DIR" || die "Kunne ikke hente NB-Whisper $SIZE (verken MLX eller whisper.cpp)."
  fi
  GOT="$(have_model)"
else
  info "NB-Whisper $SIZE finnes allerede ($GOT) i $MODEL_DIR (last ned på nytt med --refresh-model)"
fi
[ -n "$GOT" ] || die "Modellen ble ikke klargjort i $MODEL_DIR"
RUN_ENGINE="$GOT"
if [ "$RUN_ENGINE" = "mlx" ] && ! "$VPY" -c 'import mlx_whisper' >/dev/null 2>&1; then
  info "Installerer mlx-whisper (modellen er i MLX-format) …"
  "$VPY" -m pip install --quiet "mlx==$MLX_VERSION" numba tiktoken scipy more-itertools tqdm
  "$VPY" -m pip install --quiet --no-deps "mlx-whisper==$MLX_WHISPER_VERSION"
fi
CPP_BIN=""
if [ "$RUN_ENGINE" = "cpp" ]; then
  CPP_BIN="$(command -v whisper-server || true)"
  [ -n "$CPP_BIN" ] || [ ! -x /opt/homebrew/bin/whisper-server ] || CPP_BIN=/opt/homebrew/bin/whisper-server
  if [ -z "$CPP_BIN" ]; then
    command -v brew >/dev/null 2>&1 || die "whisper.cpp mangler, og Homebrew er ikke installert. Installer Homebrew og kjør: brew install whisper-cpp"
    info "Installerer whisper.cpp (brew install whisper-cpp, Metal) …"
    brew install whisper-cpp
    CPP_BIN="$(command -v whisper-server || echo /opt/homebrew/bin/whisper-server)"
  fi
  [ -x "$CPP_BIN" ] || die "Fant ikke whisper-server etter brew install whisper-cpp"
fi
command -v ffmpeg >/dev/null 2>&1 || [ -x /opt/homebrew/bin/ffmpeg ] || warn "ffmpeg mangler. Glimt-serveren sender WAV (virker uten), men curl-tester med m4a/mp3 trenger: brew install ffmpeg"

# --- Nøkkel og config.json (argumenter > eksisterende config.json > standard) --
KEY_IN=""; [ "$ROTATE" = 1 ] && KEY_IN="$(openssl rand -hex 32)"
STATE="$(
  umask 077
  IP="$IP" ALLOW="$ALLOW" PORT="$PORT" KEY_IN="$KEY_IN" NEW_RANDOM="$(openssl rand -hex 32)" DEFAULT_IP="$DEFAULT_IP" DEFAULT_ALLOW="$DEFAULT_ALLOW" \
  PORT_DEFAULT="$PORT_DEFAULT" UP="$UPSTREAM_PORT" ENGINE_RUN="$RUN_ENGINE" ENGINE_CHOICE="$ENGINE" SIZE="$SIZE" SIZE_CHOICE="$MODEL" MODEL_DIR="$MODEL_DIR" \
  CACHE_DIR="$CACHE_DIR" CPP_BIN="$CPP_BIN" VENV="$VENV" \
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
allow = [a.strip() for a in (e["ALLOW"].split(",") if e["ALLOW"] else cur.get("allow") or [e["DEFAULT_ALLOW"]]) if a.strip()]
for a in allow:
    if ipaddress.ip_network(a, strict=False).prefixlen < 16:
        sys.exit(f"--allow {a}: maks /16")
out = {"bind_ip": ip, "allow": allow, "key": key, "port": int(e["PORT"] or cur.get("port") or e["PORT_DEFAULT"]), "upstream_port": int(e["UP"]),
       "engine": e["ENGINE_RUN"], "engine_choice": e["ENGINE_CHOICE"], "size": e["SIZE"], "size_choice": e["SIZE_CHOICE"],
       "model_dir": e["MODEL_DIR"], "cache_dir": e["CACHE_DIR"], "cpp_bin": e["CPP_BIN"], "venv": e["VENV"]}
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(out, f, indent=2)
os.chmod(tmp, 0o600)
os.replace(tmp, path)
print("NEW_KEY" if new_key else "OLD_KEY")
PY
)" || die "Kunne ikke skrive config.json"
NEW_KEY=0; [ "$STATE" = "NEW_KEY" ] && NEW_KEY=1; [ "$ROTATE" = 1 ] && NEW_KEY=1
"$VPY" "$SERVICE" --config "$CONFIG" --check-config >/dev/null || die "config.json ble ikke godkjent."

cfg() { "$VPY" -c 'import json,sys; v=json.load(open(sys.argv[1]))[sys.argv[2]]; print(",".join(v) if isinstance(v, list) else v)' "$CONFIG" "$1"; }
IP="$(cfg bind_ip)"; ALLOW_PRETTY="$(cfg allow)"; KEY="$(cfg key)"; PORT="$(cfg port)"

LOCAL_IPS="$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | tr '\n' ' ')"
# shellcheck disable=SC2086
if ! printf '%s\n' $LOCAL_IPS | grep -qxF "$IP"; then
  warn "Mac-en har ikke adressen $IP akkurat nå (adresser: ${LOCAL_IPS:-ingen}). Tjenesten prøver hvert 5. sekund til adressen
dukker opp. Sjekk den faste IP-en i UniFi, eller installer med --ip <adresse>."
fi

# --- LaunchAgent -------------------------------------------------------------------
xml_escape() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
UID_NUM="$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
for d in "gui/$UID_NUM" "user/$UID_NUM"; do
  if launchctl print "$d/$LABEL" >/dev/null 2>&1; then
    info "Stopper $LABEL ($d) …"
    launchctl bootout "$d/$LABEL" 2>/dev/null || true
    n=0; while launchctl print "$d/$LABEL" >/dev/null 2>&1 && [ "$n" -lt 20 ]; do sleep 0.5; n=$((n + 1)); done
  fi
done
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$VPY")</string>
    <string>$(xml_escape "$SERVICE")</string>
    <string>--config</string>
    <string>$(xml_escape "$CONFIG")</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HF_HOME</key>
    <string>$(xml_escape "$HF_HOME")</string>
    <key>HF_HUB_OFFLINE</key>
    <string>1</string>
    <key>HF_HUB_DISABLE_TELEMETRY</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$LOG")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$LOG")</string>
</dict>
</plist>
EOF
chmod 644 "$PLIST"
/usr/bin/plutil -lint "$PLIST" >/dev/null || die "LaunchAgent-filen er ugyldig: $PLIST"
DOMAIN="gui/$UID_NUM"
launchctl enable "$DOMAIN/$LABEL" 2>/dev/null || true
if ! launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null; then
  warn "Kunne ikke starte i $DOMAIN (ingen logget inn på skrivebordet?). Prøver user/$UID_NUM."
  DOMAIN="user/$UID_NUM"
  launchctl enable "$DOMAIN/$LABEL" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$PLIST" || die "launchctl bootstrap feilet for $LABEL. Se $LOG"
fi
launchctl kickstart "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
info "LaunchAgent $LABEL startet i $DOMAIN (logg: $LOG)"

FW=/usr/libexec/ApplicationFirewall/socketfilterfw
if [ -x "$FW" ] && "$FW" --getglobalstate 2>/dev/null | grep -qE 'State = [12]'; then
  warn "macOS-brannmuren er på. Gi venv-ens Python lov til å ta imot tilkoblinger fra nettverket:
  sudo $FW --add \"$(readlink -f "$VPY" 2>/dev/null || echo "$VPY")\"
  sudo $FW --unblockapp \"$(readlink -f "$VPY" 2>/dev/null || echo "$VPY")\""
fi

sleep 2
SELF="$(curl -s -o /dev/null -w '%{http_code}' -m 5 -H "Authorization: Bearer $KEY" "http://$IP:$PORT/health" || true)"

cat <<EOF

==================================================================================
 NB-Whisper er installert (Nasjonalbiblioteket, Apache-2.0)
==================================================================================
 Modell:          NB-Whisper $SIZE · motor: $RUN_ENGINE$( [ "$RUN_ENGINE" = mlx ] && printf ' (MLX, Metal)' || printf ' (whisper.cpp, Metal)' )
 Adresse:         http://$IP:$PORT   (/v1/audio/transcriptions, /v1/audio/detect)
 Nøkkel:          $KEY$( [ "$NEW_KEY" = 1 ] && printf '   (NY)' )
 Tillatt fra:     $ALLOW_PRETTY
 Modellmappe:     $MODEL_DIR
 Konfig (600):    $CONFIG
 Logg:            $LOG
 Test fra Mac:    HTTP $SELF   (403 er riktig: Mac-en selv er ikke på tillatelseslista)

 Modellen lastes inn i minnet når tjenesten starter (medium ~20 s, large ~40 s). Følg med:  tail -f "$LOG"

 Legg inn i Homelab (admin): AI-kontroll › Tale til tekst, eller fra Glimt-serveren:
   Adresse:  http://$IP:$PORT
   Nøkkel:   $KEY

 Test fra Glimt-serveren ($ALLOW_PRETTY):
   curl -sS -H "Authorization: Bearer $KEY" http://$IP:$PORT/health          # {"status":"ok",…} (503 = laster fortsatt)
   curl -sS -H "Authorization: Bearer $KEY" -F file=@opptak.wav -F language=no -F response_format=verbose_json \\
     -F 'timestamp_granularities[]=word' http://$IP:$PORT/v1/audio/transcriptions
   curl -sS -H "Authorization: Bearer $KEY" -F file=@opptak.wav http://$IP:$PORT/v1/audio/detect
   curl -sS -o /dev/null -w '%{http_code}\n' http://$IP:$PORT/health        # uten nøkkel: 401

 Nøkkelen er hemmelig. Ikke lim den inn i chat, git eller logger.
==================================================================================
EOF
