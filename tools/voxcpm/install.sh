#!/bin/bash
# voxcpm – installer VoxCPM2 (OpenBMB, Apache-2.0) som tekst til tale med egne og klonede stemmer på Mac mini-en. Prompt 57 (VOX57).
#
#   ./install.sh                                    # standard: GGUF (Q8_0) via llama.cpp-omni med Metal, 10.69.1.173:8030
#   ./install.sh --quant f16                        # GGUF F16 (dobbelt så stor, litt bedre)
#   ./install.sh --engine torch                     # pip-pakken voxcpm (PyTorch, MPS) – raskere varm, men ~6–8 GB i minnet
#   ./install.sh --idle-min 5                       # last ut modellen etter 5 min uten bruk (standard 10, 0 = aldri)
#   ./install.sh --cache-dir /Volumes/AI/voxcpm     # modellene på den eksterne disken
#   ./install.sh --rotate-key                       # ny nøkkel (legg den inn i Homelab etterpå)
#
# Standard er det minst minnekrevende oppsettet som gir norsk: GGUF BaseLM Q8_0 + Acoustic F16 kjørt med `voxcpm2-cli` fra
# llama.cpp-omni (Metal). ~3 GB mens en setning lages, ~0 når den er ferdig (CLI-et laster modellen per forespørsel), så
# qwen3:8b kan ligge lastet i Ollama samtidig på 16 GB. Prisen er fart: RTF ~1,8 på M4 Pro (oppgitt), litt tregere på en vanlig
# M4/M2, pluss noen sekunder lasting per forespørsel. Glimt-serveren cacher lyden, så samme tekst lages bare én gang.
# Tjenesten (voxcpm_service.py) lytter bare på Mac-ens LAN-adresse, slipper bare inn Glimt-serveren (IP-liste + nøkkel) og kjører
# uten nett (HF_HUB_OFFLINE=1). Aldri eksponert via Cloudflare. Kan kjøres på nytt: nøkkel, adresse og valg beholdes.
# Fungerer med macOS sin bash 3.2.
set -euo pipefail

OMNI_REPO="https://github.com/tc-mb/llama.cpp-omni.git"
GGUF_REPO="DennisHuang648/VoxCPM2-GGUF"
TORCH_REPO="openbmb/VoxCPM2"
DEFAULT_IP="10.69.1.173"
DEFAULT_ALLOW="10.69.1.39"
PORT_DEFAULT=8030
LABEL="com.local.voxcpm"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$HOME/Library/Application Support/voxcpm"
VENV="$APP_DIR/venv"
CONFIG="$APP_DIR/config.json"
SERVICE="$APP_DIR/voxcpm_service.py"
LOG_DIR="$HOME/Library/Logs"
LOG="$LOG_DIR/voxcpm.log"

IP=""; ALLOW=""; ENGINE=""; QUANT=""; DEVICE=""; IDLE=""; CACHE_DIR=""; PORT=""; PYTHON=""; OMNI_DIR=""; ROTATE=0; REFRESH=0

die() { printf '\nFeil: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
warn() { printf '\nAdvarsel: %s\n\n' "$*" >&2; }

usage() {
  cat <<EOF
Bruk: ./install.sh [valg]

  --ip ADRESSE        Mac mini-ens LAN-adresse å lytte på (standard $DEFAULT_IP, eller den i config.json)
  --allow ADRESSE     Tillatt avsender (Glimt-serveren). Kan gjentas eller kommaseparert. Nett ned til /16. Standard $DEFAULT_ALLOW.
  --engine MOTOR      gguf (standard: llama.cpp-omni, Metal, ~3 GB bare under syntese) eller torch (pip voxcpm, MPS, ~6–8 GB)
  --quant Q           gguf: q8_0 (standard, ~halv nedlasting, nesten lik kvalitet) eller f16
  --device ENHET      torch: auto (standard, MPS på Apple silicon), mps eller cpu
  --idle-min MIN      Last ut modellen etter så mange minutter uten bruk (standard 10, 0 = aldri). Gjelder torch; gguf slipper alltid.
  --port PORT         Porten på LAN-adressen (standard $PORT_DEFAULT)
  --cache-dir MAPPE   Hvor modellene lagres (standard: $APP_DIR/models), f.eks. på den eksterne disken
  --omni-dir MAPPE    Et eksisterende llama.cpp-omni-bygg (med build/bin/voxcpm2-cli) i stedet for å klone og bygge
  --python STI        Python 3.10–3.12 å lage venv med (standard: python3.12/3.11/3.10 fra PATH eller Homebrew)
  --refresh-model     Last ned modellen (og bygg llama.cpp-omni) på nytt selv om den finnes
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
    --engine) [ $# -ge 2 ] || die "--engine trenger gguf eller torch"; ENGINE="$2"; shift 2 ;;
    --engine=*) ENGINE="${1#*=}"; shift ;;
    --quant) [ $# -ge 2 ] || die "--quant trenger q8_0 eller f16"; QUANT="$2"; shift 2 ;;
    --quant=*) QUANT="${1#*=}"; shift ;;
    --device) [ $# -ge 2 ] || die "--device trenger auto, mps eller cpu"; DEVICE="$2"; shift 2 ;;
    --device=*) DEVICE="${1#*=}"; shift ;;
    --idle-min) [ $# -ge 2 ] || die "--idle-min trenger et tall"; IDLE="$2"; shift 2 ;;
    --idle-min=*) IDLE="${1#*=}"; shift ;;
    --port) [ $# -ge 2 ] || die "--port trenger et tall"; PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    --cache-dir) [ $# -ge 2 ] || die "--cache-dir trenger en mappe"; CACHE_DIR="$2"; shift 2 ;;
    --cache-dir=*) CACHE_DIR="${1#*=}"; shift ;;
    --omni-dir) [ $# -ge 2 ] || die "--omni-dir trenger en mappe"; OMNI_DIR="$2"; shift 2 ;;
    --omni-dir=*) OMNI_DIR="${1#*=}"; shift ;;
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
command -v openssl >/dev/null 2>&1 || die "Fant ikke openssl."
command -v curl >/dev/null 2>&1 || die "Fant ikke curl."
[ -f "$SCRIPT_DIR/voxcpm_service.py" ] || die "Fant ikke voxcpm_service.py ved siden av install.sh."
QUANT="$(printf '%s' "$QUANT" | tr '[:lower:]' '[:upper:]')"
case "$ENGINE" in ""|gguf|torch) ;; *) die "--engine må være gguf eller torch" ;; esac
case "$QUANT" in ""|Q8_0|F16) ;; *) die "--quant må være q8_0 eller f16" ;; esac
case "$DEVICE" in ""|auto|mps|cpu) ;; *) die "--device må være auto, mps eller cpu" ;; esac
[ -z "$IDLE" ] || [[ "$IDLE" =~ ^[0-9]{1,4}$ ]] || die "--idle-min må være et heltall (minutter)"
[ -z "$PORT" ] || [[ "$PORT" =~ ^[0-9]{4,5}$ ]] || die "--port må være et tall (f.eks. 8030)"
[ -z "$IP" ] || is_ipv4 "$IP" || die "--ip må være en IPv4-adresse"

py_ok() { "$1" -c 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)' >/dev/null 2>&1; }
if [ -z "$PYTHON" ]; then
  for c in python3.12 python3.11 python3.10 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3.10; do
    if command -v "$c" >/dev/null 2>&1 && py_ok "$(command -v "$c")"; then PYTHON="$(command -v "$c")"; break; fi
  done
fi
[ -n "$PYTHON" ] || die "Fant ikke Python 3.10–3.12 (voxcpm støtter ikke 3.13 ennå, og macOS sin python3 er 3.9). Kjør: brew install python@3.12  – og så ./install.sh på nytt."
py_ok "$PYTHON" || die "$PYTHON er ikke Python 3.10–3.12."
info "Python: $("$PYTHON" --version 2>&1) ($PYTHON)"

prev() { [ -f "$CONFIG" ] && "$PYTHON" -c 'import json,sys
try: v=json.load(open(sys.argv[1])).get(sys.argv[2]); print(v if v is not None else "")
except Exception: print("")' "$CONFIG" "$1" 2>/dev/null || true; }
[ -n "$ENGINE" ] || ENGINE="$(prev engine)"
[ -n "$QUANT" ] || QUANT="$(prev quant)"
[ -n "$DEVICE" ] || DEVICE="$(prev device)"
[ -n "$IDLE" ] || IDLE="$(prev idle_unload_min | sed 's/\.0$//')"
[ -n "$CACHE_DIR" ] || CACHE_DIR="$(prev cache_dir)"
[ -n "$ENGINE" ] || ENGINE="gguf"
[ -n "$QUANT" ] || QUANT="Q8_0"
[ -n "$DEVICE" ] || DEVICE="auto"
[ -n "$IDLE" ] || IDLE="10"

ARCH="$(uname -m)"
MEM_BYTES="$(sysctl -n hw.memsize 2>/dev/null || echo 0)"
MEM_GB=$(( MEM_BYTES / 1073741824 ))
info "Minne: ${MEM_GB} GB · motor: $ENGINE$( [ "$ENGINE" = gguf ] && printf ' (%s)' "$QUANT" )"
if [ "$ENGINE" = "torch" ] && [ "$MEM_GB" -gt 0 ] && [ "$MEM_GB" -lt 24 ]; then
  warn "VoxCPM2 i PyTorch bruker ~6–8 GB mens den er lastet. Med ${MEM_GB} GB og qwen3:8b i Ollama kan Mac-en begynne å swappe.
GGUF (standard) er anbefalt på 16 GB. Modellen lastes ut etter $IDLE min uten bruk."
fi
[ "$ARCH" = "arm64" ] || warn "Dette er ikke Apple silicon – Metal/MPS virker ikke, alt går på CPU (tregt)."

mkdir -p "$APP_DIR" "$APP_DIR/refs" "$HOME/Library/LaunchAgents" "$LOG_DIR"
chmod 700 "$APP_DIR" "$APP_DIR/refs"
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
info "Installerer huggingface_hub …"
"$VPY" -m pip install --quiet "huggingface_hub>=0.23"
cp "$SCRIPT_DIR/voxcpm_service.py" "$SERVICE.new"; chmod 600 "$SERVICE.new"; mv -f "$SERVICE.new" "$SERVICE"

command -v ffmpeg >/dev/null 2>&1 || [ -x /opt/homebrew/bin/ffmpeg ] || {
  if command -v brew >/dev/null 2>&1; then info "Installerer ffmpeg (mp3 til Glimt) …"; brew install ffmpeg
  else warn "ffmpeg mangler og Homebrew finnes ikke. Tjenesten sender da WAV (større filer). Installer: brew install ffmpeg"; fi
}
FFMPEG="$(command -v ffmpeg || { [ -x /opt/homebrew/bin/ffmpeg ] && echo /opt/homebrew/bin/ffmpeg; } || true)"

CLI_BIN=""; BASELM=""; ACOUSTIC=""; MODEL_DIR=""; OMNI_REV=""
if [ "$ENGINE" = "gguf" ]; then
  # --- llama.cpp-omni (voxcpm2-cli med Metal) ---------------------------------------
  if [ -n "$OMNI_DIR" ]; then
    CLI_BIN="$OMNI_DIR/build/bin/voxcpm2-cli"
    [ -x "$CLI_BIN" ] || die "Fant ikke $CLI_BIN (bygg med: cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --target voxcpm2-cli -j)"
  else
    OMNI_DIR="$APP_DIR/llama.cpp-omni"
    CLI_BIN="$OMNI_DIR/build/bin/voxcpm2-cli"
    if [ "$REFRESH" = 1 ] || [ ! -x "$CLI_BIN" ]; then
      xcode-select -p >/dev/null 2>&1 || die "Xcode Command Line Tools mangler. Kjør: xcode-select --install  – og så ./install.sh på nytt."
      command -v git >/dev/null 2>&1 || die "Fant ikke git (xcode-select --install)."
      if ! command -v cmake >/dev/null 2>&1; then
        command -v brew >/dev/null 2>&1 || die "cmake mangler, og Homebrew er ikke installert. Installer Homebrew og kjør: brew install cmake"
        info "Installerer cmake …"; brew install cmake
      fi
      if [ -d "$OMNI_DIR/.git" ]; then
        info "Oppdaterer llama.cpp-omni …"; git -C "$OMNI_DIR" pull --ff-only --quiet || warn "git pull feilet – bygger det som finnes."
      else
        info "Henter llama.cpp-omni ($OMNI_REPO) …"; git clone --depth 1 --quiet "$OMNI_REPO" "$OMNI_DIR"
      fi
      info "Bygger voxcpm2-cli (Metal) – tar noen minutter …"
      cmake -S "$OMNI_DIR" -B "$OMNI_DIR/build" -DCMAKE_BUILD_TYPE=Release >/dev/null
      cmake --build "$OMNI_DIR/build" --target voxcpm2-cli -j >/dev/null
      [ -x "$CLI_BIN" ] || die "Bygget ga ikke $CLI_BIN"
    else
      info "voxcpm2-cli finnes allerede ($CLI_BIN) – bygg på nytt med --refresh-model"
    fi
  fi
  OMNI_REV="$(git -C "$OMNI_DIR" rev-parse --short HEAD 2>/dev/null || echo ukjent)"
  # --- GGUF-vektene (lastes ned nå) ---------------------------------------------------
  MODEL_DIR="$MODELS_ROOT/VoxCPM2-GGUF"
  mkdir -p "$MODEL_DIR"
  info "Henter VoxCPM2 GGUF ($QUANT + Acoustic) fra Hugging Face ($GGUF_REPO) …"
  PICK="$(REFRESH="$REFRESH" "$VPY" - "$GGUF_REPO" "$QUANT" "$MODEL_DIR" <<'PY'
import os, sys
from huggingface_hub import hf_hub_download, list_repo_files
repo, quant, out = sys.argv[1], sys.argv[2], sys.argv[3]
files = [f for f in list_repo_files(repo) if f.lower().endswith(".gguf")]
base = [f for f in files if "baselm" in f.lower() and quant.lower() in f.lower()]
ac = [f for f in files if "acoustic" in f.lower()]
ac = sorted(ac, key=lambda f: (0 if "f16" in f.lower() else 1, f))
if not base or not ac:
    sys.exit(f"fant ikke BaseLM-{quant} og Acoustic i {repo} (filer: {', '.join(files)[:400]})")
paths = []
for f in (sorted(base)[0], ac[0]):
    target = os.path.join(out, os.path.basename(f))
    if os.environ.get("REFRESH") != "1" and os.path.exists(target) and os.path.getsize(target) > 1_000_000:
        paths.append(target); continue
    p = hf_hub_download(repo, f, local_dir=out)
    paths.append(p)
print("\n".join(paths))
PY
)" || die "Kunne ikke hente GGUF-vektene (se feilen over)."
  BASELM="$(printf '%s\n' "$PICK" | sed -n 1p)"; ACOUSTIC="$(printf '%s\n' "$PICK" | sed -n 2p)"
  [ -f "$BASELM" ] && [ -f "$ACOUSTIC" ] || die "GGUF-filene ble ikke lagret i $MODEL_DIR"
  info "Prøvekjører voxcpm2-cli …"
  TMPW="$(mktemp -t voxcpm).wav"
  if "$CLI_BIN" -t "Hei, dette er en test." -o "$TMPW" --seed 42 "$BASELM" "$ACOUSTIC" >/dev/null 2>&1 && [ -s "$TMPW" ]; then info "voxcpm2-cli virker ($(wc -c < "$TMPW" | tr -d ' ') byte WAV)"
  else warn "Prøvekjøringen av voxcpm2-cli feilet. Tjenesten starter likevel; se $LOG og prøv: \"$CLI_BIN\" -t Hei -o /tmp/t.wav \"$BASELM\" \"$ACOUSTIC\""; fi
  rm -f "$TMPW"
else
  # --- PyTorch (pip voxcpm, MPS) -------------------------------------------------------
  info "Installerer voxcpm (PyTorch) – stor nedlasting (~2 GB pakker) …"
  "$VPY" -m pip install --quiet "torch>=2.5" voxcpm numpy soundfile
  "$VPY" -c 'import voxcpm, torch; print("torch", torch.__version__, "mps", torch.backends.mps.is_available())' || die "voxcpm/torch ble ikke installert riktig"
  MODEL_DIR="$MODELS_ROOT/VoxCPM2"
  if [ "$REFRESH" = 1 ] || [ ! -f "$MODEL_DIR/config.json" ]; then
    info "Henter $TORCH_REPO (~5 GB) …"
    "$VPY" -c 'import sys; from huggingface_hub import snapshot_download; snapshot_download(sys.argv[1], local_dir=sys.argv[2])' "$TORCH_REPO" "$MODEL_DIR" || die "Kunne ikke hente $TORCH_REPO"
  else
    info "$TORCH_REPO finnes allerede i $MODEL_DIR (last ned på nytt med --refresh-model)"
  fi
fi
VOXCPM_PKG="$("$VPY" -c 'import importlib.metadata as m; print(m.version("voxcpm"))' 2>/dev/null || echo "-")"

# --- Nøkkel og config.json (argumenter > eksisterende config.json > standard) --
KEY_IN=""; [ "$ROTATE" = 1 ] && KEY_IN="$(openssl rand -hex 32)"
STATE="$(
  umask 077
  IP="$IP" ALLOW="$ALLOW" PORT="$PORT" KEY_IN="$KEY_IN" NEW_RANDOM="$(openssl rand -hex 32)" DEFAULT_IP="$DEFAULT_IP" DEFAULT_ALLOW="$DEFAULT_ALLOW" \
  PORT_DEFAULT="$PORT_DEFAULT" ENGINE="$ENGINE" QUANT="$QUANT" DEVICE="$DEVICE" IDLE="$IDLE" MODEL_DIR="$MODEL_DIR" CACHE_DIR="$CACHE_DIR" \
  CLI_BIN="$CLI_BIN" BASELM="$BASELM" ACOUSTIC="$ACOUSTIC" OMNI_REV="$OMNI_REV" FFMPEG="$FFMPEG" VENV="$VENV" REFS="$APP_DIR/refs" PKG="$VOXCPM_PKG" \
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
out = {"bind_ip": ip, "allow": allow, "key": key, "port": int(e["PORT"] or cur.get("port") or e["PORT_DEFAULT"]),
       "engine": e["ENGINE"], "quant": e["QUANT"] if e["ENGINE"] == "gguf" else "", "device": e["DEVICE"], "idle_unload_min": float(e["IDLE"]),
       "model_dir": e["MODEL_DIR"], "cache_dir": e["CACHE_DIR"], "cli_bin": e["CLI_BIN"], "baselm": e["BASELM"], "acoustic": e["ACOUSTIC"],
       "omni_rev": e["OMNI_REV"], "voxcpm_pkg": e["PKG"], "ffmpeg": e["FFMPEG"], "refs_dir": e["REFS"], "venv": e["VENV"],
       "cfg_value": cur.get("cfg_value") or 2.0, "timesteps": cur.get("timesteps") or 10, "seed": cur.get("seed") or 42}
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
    <key>PYTORCH_ENABLE_MPS_FALLBACK</key>
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
 VoxCPM2 er installert (OpenBMB, Apache-2.0)
==================================================================================
 Motor:           $ENGINE$( [ "$ENGINE" = gguf ] && printf ' · GGUF %s + Acoustic · llama.cpp-omni %s (Metal)' "$QUANT" "$OMNI_REV" || printf ' · voxcpm %s · enhet %s' "$VOXCPM_PKG" "$DEVICE" )
 Minne:           $( [ "$ENGINE" = gguf ] && printf '~3 GB bare mens en setning lages (Q8_0), ellers ~0' || printf '~6–8 GB når lastet · lastes ut etter %s min uten bruk' "$IDLE" )
 Adresse:         http://$IP:$PORT   (/v1/audio/speech, /v1/refs/<sha>, /health)
 Nøkkel:          $KEY$( [ "$NEW_KEY" = 1 ] && printf '   (NY)' )
 Tillatt fra:     $ALLOW_PRETTY
 Modellmappe:     $MODEL_DIR
 Referanser:      $APP_DIR/refs   (bare innholds-hash, aldri navn/bruker)
 Konfig (600):    $CONFIG
 Logg:            $LOG
 Test fra Mac:    HTTP $SELF   (403 er riktig: Mac-en selv er ikke på tillatelseslista)

 Legg inn i Homelab (admin): AI-kontroll › VoxCPM (Mac mini):
   Adresse:  http://$IP:$PORT
   Nøkkel:   $KEY

 Test fra Glimt-serveren ($ALLOW_PRETTY):
   curl -sS -H "Authorization: Bearer $KEY" http://$IP:$PORT/health
   curl -sS -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -o hei.mp3 \\
     -d '{"input":"Hei, dette er VoxCPM på Mac minien.","voice":{"kind":"design","prompt":"En rolig, varm kvinnestemme"},"response_format":"mp3"}' \\
     http://$IP:$PORT/v1/audio/speech
   curl -sS -o /dev/null -w '%{http_code}\n' http://$IP:$PORT/health        # uten nøkkel: 401

 Kloning: bare egen stemme eller med samtykke. Aldri for å utgi seg for andre, svindel eller desinformasjon (VoxCPM-vilkårene).
 Nøkkelen er hemmelig. Ikke lim den inn i chat, git eller logger.
==================================================================================
EOF
