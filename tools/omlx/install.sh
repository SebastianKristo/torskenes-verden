#!/bin/bash
# omlx – installer oMLX (MLX-motor, OpenAI-kompatibel) på Mac mini-en som motor bak AI-gaten i Homelab. Prompt 58 (OMLX58).
#
#   ./install.sh                                  # oMLX på 127.0.0.1:18040, vakt på 10.69.1.173:8040, tillater 10.69.1.39, laster ned modellene
#   ./install.sh --model-dir /Volumes/AI/omlx     # modellene på den eksterne disken (som Ollama)
#   ./install.sh --memory-gb 10                   # minnevakt (oMLX sitt tak for modeller + KV-cache), standard RAM − 7 GB (16 GB → 9)
#   ./install.sh --no-vision                      # bare tekstmodellen (Qwen3-8B), ikke Qwen2.5-VL-7B
#   ./install.sh --skip-models                    # ikke last ned modeller nå (gjør det i admin-panelet på Mac-en)
#   ./install.sh --upgrade                        # brew upgrade omlx først
#   ./install.sh --rotate-key                     # ny nøkkel (oppdater Homelab etterpå)
#
# Hva skriptet gjør:
#   1. brew tap jundot/omlx https://github.com/jundot/omlx && brew install jundot/omlx/omlx  (uten egne Metal-kjerner – trenger ikke Xcode;
#      Qwen3-8B og Qwen2.5-VL trenger dem ikke). Stopper Homebrew-tjenesten «omlx» (den bruker port 8000, som Neutrino/Fermion har).
#   2. Laster ned mlx-community/Qwen3-8B-4bit (~4,6 GB) og mlx-community/Qwen2.5-VL-7B-Instruct-4bit (~5,6 GB) til modellmappen
#      (standard ~/.omlx/models/mlx-community/…). Embeddings blir på Ollama (nomic-embed-text): ingen MLX-variant av den er sjekket her,
#      og vektorer fra ulike motorer kan ikke blandes i samme indeks.
#   3. Nøkkel og config.json (600) i ~/Library/Application Support/omlx58, og LaunchAgenten com.local.omlx58. Agenten kjører vakten
#      (guard.py), som starter `omlx serve --host 127.0.0.1 --port 18040` (nøkkel i OMLX_API_KEY, minnevakt, SSD-cache) og bare slipper inn
#      Glimt-serveren (IP-liste + nøkkel, konstant-tid) på Mac-ens LAN-adresse. Aldri via Cloudflare.
#
# 16 GB: Ollama og oMLX bør ikke holde en modell samtidig (qwen3:8b i Ollama ~5,2 GB + Qwen3-8B i oMLX ~4,6 GB + KV + macOS går ikke).
# Bytt slik:   ollama stop qwen3:8b            (laster ut av Ollama med en gang; eller keep_alive 0 per modell i AI-kontroll)
#              launchctl kickstart -k gui/$(id -u)/com.local.omlx58   (oMLX starter på nytt uten modeller i minnet)
#              launchctl bootout gui/$(id -u)/com.local.omlx58        (stopper oMLX helt; ./install.sh starter den igjen)
# Kan kjøres på nytt: nøkkel, adresse og valg beholdes hvis du ikke gir nye. Fungerer med macOS sin bash 3.2.
set -euo pipefail

DEFAULT_IP="10.69.1.173"
DEFAULT_ALLOW="10.69.1.39"
PORT_DEFAULT=8040
UPSTREAM_PORT=18040
TEXT_MODEL="mlx-community/Qwen3-8B-4bit"
VISION_MODEL="mlx-community/Qwen2.5-VL-7B-Instruct-4bit"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$HOME/Library/Application Support/omlx58"
CONFIG="$APP_DIR/config.json"
GUARD="$APP_DIR/guard.py"
LOG_DIR="$HOME/Library/Logs"
LOG="$LOG_DIR/omlx58.log"
LABEL="com.local.omlx58"

IP=""; ALLOW=""; PORT=""; MODEL_DIR=""; MEMORY_GB=""; CACHE_DIR=""; NO_VISION=0; SKIP_MODELS=0; UPGRADE=0; ROTATE=0

die() { printf '\nFeil: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
warn() { printf '\nAdvarsel: %s\n\n' "$*" >&2; }

usage() {
  cat <<EOF
Bruk: ./install.sh [valg]

  --ip ADRESSE        Mac mini-ens LAN-adresse vakten lytter på (standard $DEFAULT_IP, eller den i config.json)
  --allow ADRESSE     Tillatt avsender (Glimt-serveren). Kan gjentas eller kommaseparert. Nett ned til /16. Standard $DEFAULT_ALLOW.
  --port PORT         Vaktens port på LAN-adressen (standard $PORT_DEFAULT; ikke 8000 – den har Neutrino)
  --model-dir MAPPE   Modellmappen oMLX leser (standard ~/.omlx/models), f.eks. på den eksterne disken
  --memory-gb N       Minnevakt for oMLX i GB (--memory-guard-gb; standard RAM − 7 GB, 16 GB → 9). Qwen3-8B 4-bit trenger ~4,6 GB + KV.
  --ssd-cache MAPPE   KV-cache på SSD (--paged-ssd-cache-dir, standard ~/.omlx/cache, maks 20 GB)
  --no-vision         Ikke last ned $VISION_MODEL
  --skip-models       Ikke last ned modeller nå
  --omlx-bin STI      bruk denne omlx (f.eks. ~/.omlx/bin/omlx fra Mac-appen) i stedet for Homebrew
  --upgrade           brew update && brew upgrade omlx
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
    --port) [ $# -ge 2 ] || die "--port trenger et tall"; PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    --model-dir) [ $# -ge 2 ] || die "--model-dir trenger en mappe"; MODEL_DIR="$2"; shift 2 ;;
    --model-dir=*) MODEL_DIR="${1#*=}"; shift ;;
    --memory-gb) [ $# -ge 2 ] || die "--memory-gb trenger et tall"; MEMORY_GB="$2"; shift 2 ;;
    --memory-gb=*) MEMORY_GB="${1#*=}"; shift ;;
    --ssd-cache) [ $# -ge 2 ] || die "--ssd-cache trenger en mappe"; CACHE_DIR="$2"; shift 2 ;;
    --ssd-cache=*) CACHE_DIR="${1#*=}"; shift ;;
    --no-vision) NO_VISION=1; shift ;;
    --skip-models) SKIP_MODELS=1; shift ;;
    --omlx-bin) [ $# -ge 2 ] || die "--omlx-bin trenger en sti"; OMLX_BIN="$2"; shift 2 ;;
    --upgrade) UPGRADE=1; shift ;;
    --rotate-key) ROTATE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "Ukjent valg: $1" ;;
  esac
done

# --- Forutsetninger -----------------------------------------------------------
[ "$(uname -s)" = "Darwin" ] || die "Dette skriptet må kjøres på Mac mini-en (macOS)."
[ "$(id -u)" -ne 0 ] || die "Ikke kjør med sudo/root. Kjør som brukeren som er logget inn på Mac mini-en."
[ "$(uname -m)" = "arm64" ] || die "oMLX krever Apple silicon (M1–M5)."
MACOS_MAJOR="$(sw_vers -productVersion 2>/dev/null | cut -d. -f1)"
[ "${MACOS_MAJOR:-0}" -ge 15 ] || die "oMLX krever macOS 15 (Sequoia) eller nyere (har $(sw_vers -productVersion 2>/dev/null))."
command -v brew >/dev/null 2>&1 || die "Fant ikke Homebrew (https://brew.sh)."
command -v openssl >/dev/null 2>&1 || die "Fant ikke openssl."
[ -f "$SCRIPT_DIR/guard.py" ] || die "Fant ikke guard.py ved siden av install.sh."
[ -z "$PORT" ] || [[ "$PORT" =~ ^[0-9]{4,5}$ ]] || die "--port må være et tall (f.eks. 8040)"
[ "$PORT" != "8000" ] || die "Port 8000 brukes av Neutrino (Fermion) på Mac mini-en – velg en annen."
[ -z "$MEMORY_GB" ] || [[ "$MEMORY_GB" =~ ^[0-9]{1,3}$ ]] || die "--memory-gb må være et heltall (GB)"

RAM_GB="$(( $(sysctl -n hw.memsize) / 1073741824 ))"
if [ -z "$MEMORY_GB" ]; then MEMORY_GB=$(( RAM_GB - 7 )); [ "$MEMORY_GB" -ge 6 ] || MEMORY_GB=6; fi
[ "$MEMORY_GB" -lt "$RAM_GB" ] || die "--memory-gb ($MEMORY_GB) må være mindre enn minnet i Mac-en ($RAM_GB GB)"
[ "$MEMORY_GB" -ge 6 ] || warn "Minnevakt $MEMORY_GB GB: Qwen3-8B 4-bit (~4,6 GB) + KV-cache får knapt plass."

# --- oMLX: Homebrew, ellers Mac-appen (ferdigbygd .dmg) -----------------------
# Homebrew-formelen bygger noen pakker fra kildekode og har feilet i etterkontrollen (spaCy: «OverflowError: Python int too large to
# convert to C ssize_t»). Mac-appen fra github.com/jundot/omlx/releases er ferdigbygd og legger en CLI i ~/.omlx/bin/omlx – den brukes
# når Homebrew-varianten mangler eller feiler. Sett --omlx-bin STI for å peke på en annen omlx.
BREW_OK=0
if [ -z "${OMLX_BIN:-}" ] && [ ! -x "$HOME/.omlx/bin/omlx" ]; then
  if brew list --versions omlx >/dev/null 2>&1; then BREW_OK=1
  else
    info "Installerer oMLX fra Homebrew (jundot/omlx, uten egne Metal-kjerner – Xcode trengs ikke) …"
    if brew tap jundot/omlx https://github.com/jundot/omlx && brew install jundot/omlx/omlx; then BREW_OK=1
    else warn "Homebrew-installasjonen av oMLX feilet (kjent feil i formelen). Prøver Mac-appen i stedet."; fi
  fi
elif brew list --versions omlx >/dev/null 2>&1; then BREW_OK=1; fi
if [ "$BREW_OK" = 1 ] && [ "$UPGRADE" = 1 ]; then info "Oppgraderer oMLX …"; brew update && brew upgrade omlx || true; fi
BREW_PREFIX="$(brew --prefix)"
if [ -z "${OMLX_BIN:-}" ]; then
  for c in "$BREW_PREFIX/bin/omlx" "$HOME/.omlx/bin/omlx" "$(command -v omlx || true)"; do
    if [ -n "$c" ] && [ -x "$c" ] && [ "$c" != "$BREW_PREFIX/bin/omlx" -o "$BREW_OK" = 1 ]; then OMLX_BIN="$c"; break; fi
  done
fi
if [ -z "${OMLX_BIN:-}" ] || [ ! -x "$OMLX_BIN" ]; then
  die "Fant ikke omlx. Installer Mac-appen: last ned siste oMLX-*.dmg fra https://github.com/jundot/omlx/releases, dra den til Programmer, åpne den én gang (den lager ~/.omlx/bin/omlx), slå av «start server automatisk» i appen (vi kjører vår egen tjeneste på port 18040), og kjør ./install.sh på nytt."
fi
# Python til vakten og nedlastingene: oMLX sin egen fra Homebrew, ellers et eget venv med huggingface_hub.
OPY="$BREW_PREFIX/opt/omlx/libexec/bin/python"
if [ "$BREW_OK" != 1 ] || [ ! -x "$OPY" ]; then
  VENV="$APP_DIR/venv"
  if [ ! -x "$VENV/bin/python" ]; then
    PYB=""; for v in python3.12 python3.11 python3.13; do command -v "$v" >/dev/null 2>&1 && { PYB="$(command -v "$v")"; break; }; done
    [ -n "$PYB" ] || die "Fant ikke Python 3.11–3.13 (brew install python@3.12)."
    mkdir -p "$APP_DIR" && "$PYB" -m venv "$VENV" || die "Kunne ikke lage venv i $VENV"
  fi
  "$VENV/bin/python" -c 'import huggingface_hub' 2>/dev/null || "$VENV/bin/python" -m pip install -q --upgrade pip huggingface_hub || die "Kunne ikke installere huggingface_hub i $VENV"
  OPY="$VENV/bin/python"
fi
"$OPY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || die "Python for vakten ($OPY) er for gammel."
info "oMLX: $("$OMLX_BIN" --version 2>/dev/null || echo omlx) ($OMLX_BIN)"

# Homebrew-tjenesten (omlx start) bruker port 8000 – samme som Neutrino. Vi kjører vår egen LaunchAgent i stedet.
if brew services list 2>/dev/null | awk '$1=="omlx"{print $2}' | grep -qE 'started|scheduled'; then
  info "Stopper Homebrew-tjenesten omlx (port 8000) – com.local.omlx58 tar over på egen port …"
  brew services stop omlx >/dev/null 2>&1 || true
fi

mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents" "$LOG_DIR"
chmod 700 "$APP_DIR"
cp "$SCRIPT_DIR/guard.py" "$GUARD.new"; chmod 600 "$GUARD.new"; mv -f "$GUARD.new" "$GUARD"

# --- Nøkkel og config.json (argumenter > eksisterende config.json > standard) --
KEY_IN=""
[ "$ROTATE" = 1 ] && KEY_IN="$(openssl rand -hex 32)"
STATE="$(
  umask 077
  IP="$IP" ALLOW="$ALLOW" PORT="$PORT" MODEL_DIR="$MODEL_DIR" MEMORY_GB="$MEMORY_GB" CACHE_DIR="$CACHE_DIR" OMLX_BIN="$OMLX_BIN" \
  KEY_IN="$KEY_IN" NEW_RANDOM="$(openssl rand -hex 32)" DEFAULT_IP="$DEFAULT_IP" DEFAULT_ALLOW="$DEFAULT_ALLOW" \
  PORT_DEFAULT="$PORT_DEFAULT" UP="$UPSTREAM_PORT" HOME_DIR="$HOME" \
  "$OPY" - "$CONFIG" <<'PY'
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
home = e["HOME_DIR"]
out = {
    "bind_ip": ip, "allow": allow, "key": key,
    "port": int(e["PORT"] or cur.get("port") or e["PORT_DEFAULT"]), "upstream_port": int(e["UP"]),
    "omlx_bin": e["OMLX_BIN"],
    "model_dir": e["MODEL_DIR"] or cur.get("model_dir") or os.path.join(home, ".omlx", "models"),
    "memory_guard_gb": int(e["MEMORY_GB"]),
    "max_concurrent": int(cur.get("max_concurrent") or 2),
    "ssd_cache_dir": e["CACHE_DIR"] or cur.get("ssd_cache_dir") or os.path.join(home, ".omlx", "cache"),
    "ssd_cache_max": cur.get("ssd_cache_max") or "20GB",
    "extra_args": cur.get("extra_args") or [],
}
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(out, f, indent=2)
os.chmod(tmp, 0o600)
os.replace(tmp, path)
print("NEW_KEY" if new_key else "OLD_KEY")
PY
)" || die "Kunne ikke skrive config.json"
NEW_KEY=0; [ "$STATE" = "NEW_KEY" ] && NEW_KEY=1
"$OPY" "$GUARD" --config "$CONFIG" --check-config >/dev/null || die "config.json ble ikke godkjent."

cfg() { "$OPY" -c 'import json,sys; v=json.load(open(sys.argv[1]))[sys.argv[2]]; print(",".join(v) if isinstance(v, list) else v)' "$CONFIG" "$1"; }
IP="$(cfg bind_ip)"; ALLOW_PRETTY="$(cfg allow)"; KEY="$(cfg key)"; PORT="$(cfg port)"; MODEL_DIR="$(cfg model_dir)"; CACHE_DIR="$(cfg ssd_cache_dir)"
mkdir -p "$MODEL_DIR" "$CACHE_DIR" || die "Kan ikke lage $MODEL_DIR / $CACHE_DIR (er disken montert?)"

# --- Modeller (Hugging Face, til modellmappen) ---------------------------------
download() {
  local repo="$1" dest="$MODEL_DIR/$1"
  if [ -f "$dest/config.json" ] && ls "$dest"/*.safetensors >/dev/null 2>&1; then info "Har $repo"; return 0; fi
  info "Laster ned $repo til $dest (flere GB, kan ta tid) …"
  HF_HUB_DISABLE_TELEMETRY=1 "$OPY" - "$repo" "$dest" <<'PY' || die "Nedlasting av $repo feilet. Prøv igjen, eller last ned i oMLX-admin på Mac-en (http://127.0.0.1:18040/admin)."
import sys
try:
    from huggingface_hub import snapshot_download
except ImportError:
    sys.exit("huggingface_hub mangler i oMLX sin Python. Kjør: " + sys.executable + " -m pip install huggingface_hub")
snapshot_download(repo_id=sys.argv[1], local_dir=sys.argv[2], allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model", "*.tiktoken", "*.jinja", "*.py"])
PY
}
if [ "$SKIP_MODELS" = 0 ]; then
  download "$TEXT_MODEL"
  [ "$NO_VISION" = 1 ] || download "$VISION_MODEL"
else
  info "Hopper over modellnedlasting (--skip-models)."
fi

LOCAL_IPS="$(ifconfig 2>/dev/null | awk '/inet /{print $2}' | tr '\n' ' ')"
# shellcheck disable=SC2086
if ! printf '%s\n' $LOCAL_IPS | grep -qxF "$IP"; then
  warn "Mac-en har ikke adressen $IP akkurat nå (adresser: ${LOCAL_IPS:-ingen}). Vakten prøver hvert 5. sekund til adressen
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
    n=0; while launchctl print "$d/$LABEL" >/dev/null 2>&1 && [ "$n" -lt 30 ]; do sleep 0.5; n=$((n + 1)); done
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
    <string>$(xml_escape "$OPY")</string>
    <string>$(xml_escape "$GUARD")</string>
    <string>--config</string>
    <string>$(xml_escape "$CONFIG")</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(xml_escape "$BREW_PREFIX/bin:/usr/bin:/bin:/usr/sbin:/sbin")</string>
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
info "LaunchAgent $LABEL startet i $DOMAIN (logg: $LOG · oMLX sin egen logg: ~/.omlx/logs/server.log)"

FW=/usr/libexec/ApplicationFirewall/socketfilterfw
if [ -x "$FW" ] && "$FW" --getglobalstate 2>/dev/null | grep -qE 'State = [12]'; then
  warn "macOS-brannmuren er på. Gi vaktens Python lov til å ta imot tilkoblinger fra nettverket:
  sudo $FW --add \"$(readlink -f "$OPY" 2>/dev/null || echo "$OPY")\"
  sudo $FW --unblockapp \"$(readlink -f "$OPY" 2>/dev/null || echo "$OPY")\""
fi

# --- Ollama og minnet (16 GB) -------------------------------------------------------
OLLAMA_LOADED="$(curl -s -m 2 http://127.0.0.1:11434/api/ps 2>/dev/null | "$OPY" -c 'import json,sys
try: print(" ".join(m.get("name","") for m in json.load(sys.stdin).get("models",[]) if "embed" not in m.get("name","")))
except Exception: pass' 2>/dev/null || true)"
if [ -n "$OLLAMA_LOADED" ]; then
  warn "Ollama holder nå: $OLLAMA_LOADED. Med $RAM_GB GB bør ikke Ollama og oMLX ha en stor modell lastet samtidig.
  Last ut fra Ollama:  for m in $OLLAMA_LOADED; do ollama stop \$m; done
  (eller sett keep_alive 0 for modellen i Homelab › AI-kontroll › Valg, så laster Ollama den ut når køen er tom)"
fi

sleep 3
SELF_UP="$(curl -s -o /dev/null -w '%{http_code}' -m 5 -H "Authorization: Bearer $KEY" "http://127.0.0.1:$UPSTREAM_PORT/v1/models" || true)"
SELF_G="$(curl -s -o /dev/null -w '%{http_code}' -m 5 -H "Authorization: Bearer $KEY" "http://$IP:$PORT/health" || true)"

cat <<EOF

==================================================================================
 oMLX er installert (motor bak AI-gaten i Homelab)
==================================================================================
 Vakt (LAN):      http://$IP:$PORT   (/health, /v1/models, /v1/chat/completions, /v1/embeddings)
 oMLX (lokalt):   http://127.0.0.1:$UPSTREAM_PORT   (admin-panel: http://127.0.0.1:$UPSTREAM_PORT/admin – bare på Mac-en)
 Nøkkel:          $KEY$( [ "$NEW_KEY" = 1 ] && printf '   (NY)' )
 Tillatt fra:     $ALLOW_PRETTY
 Modeller:        $MODEL_DIR  ($TEXT_MODEL$( [ "$NO_VISION" = 1 ] || printf ', %s' "$VISION_MODEL" ))
 Minnevakt:       $(cfg memory_guard_gb) GB av $RAM_GB GB · SSD-cache $CACHE_DIR (maks $(cfg ssd_cache_max))
 Konfig (600):    $CONFIG
 Logg:            $LOG  ·  ~/.omlx/logs/server.log
 Test fra Mac:    oMLX HTTP ${SELF_UP:-–} (200 = klar, 000 = starter fortsatt) · vakt HTTP ${SELF_G:-–} (403 er riktig: Mac-en selv er ikke på lista)

 Legg inn i Homelab (admin): AI-kontroll › Modeller › «oMLX på Mac mini-en»:
   Adresse:  http://$IP:$PORT
   Nøkkel:   $KEY
 Ollama er fortsatt standard. Velg oMLX per oppgave under AI-kontroll › Valg › «Motor per oppgave» når eval har avgjort.

 Test fra Glimt-serveren ($ALLOW_PRETTY):
   curl -sS -H "Authorization: Bearer $KEY" http://$IP:$PORT/health        # {"status":"ok","models":[…]} (503 = starter)
   curl -sS -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \\
     -d '{"model":"$TEXT_MODEL","messages":[{"role":"user","content":"Hei! Svar kort. /no_think"}],"max_tokens":40,"chat_template_kwargs":{"enable_thinking":false}}' \\
     http://$IP:$PORT/v1/chat/completions
   curl -sS -o /dev/null -w '%{http_code}\n' http://$IP:$PORT/health        # uten nøkkel: 401

 Eval på Mac-en (samme caser som Ollama; stopp først Ollama-modellen: ollama stop qwen3:8b):
   npm run eval -- --backend omlx --url http://127.0.0.1:$UPSTREAM_PORT --key $KEY --ollama-url http://127.0.0.1:11434

 Bytte motor på 16 GB:  ollama stop qwen3:8b  ·  launchctl kickstart -k $DOMAIN/$LABEL  ·  launchctl bootout $DOMAIN/$LABEL
 Nøkkelen er hemmelig. Ikke lim den inn i chat, git eller logger.
==================================================================================
EOF
