#!/bin/bash
# voxcpm – fjern LaunchAgenten com.local.voxcpm (prompt 57).
#   ./uninstall.sh          # stopper og fjerner agenten, beholder venv, config.json (nøkkelen), modellene og referansene
#   ./uninstall.sh --purge  # sletter også venv, config.json, llama.cpp-omni-bygget, modellene i standardmappa, referansene og loggen
set -euo pipefail
APP_DIR="$HOME/Library/Application Support/voxcpm"
LABEL="com.local.voxcpm"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1
[ "$(uname -s)" = "Darwin" ] || { echo "Kjøres på Mac mini-en." >&2; exit 1; }
UID_NUM="$(id -u)"
for d in "gui/$UID_NUM" "user/$UID_NUM"; do launchctl bootout "$d/$LABEL" 2>/dev/null || true; done
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "==> Fjernet $LABEL"
if [ "$PURGE" = 1 ]; then
  PY="$APP_DIR/venv/bin/python"; [ -x "$PY" ] || PY=python3
  CACHE="$("$PY" -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get("cache_dir") or "")
except Exception: print("")' "$APP_DIR/config.json" 2>/dev/null || true)"
  rm -rf "$APP_DIR" "$HOME/Library/Logs/voxcpm.log"
  echo "==> Slettet $APP_DIR (venv, config.json, llama.cpp-omni, modellene i standardmappa, referanseopptakene) og loggen."
  [ -z "$CACHE" ] || echo "    Modellene i --cache-dir er beholdt. Slett dem med: rm -rf \"$CACHE\"/VoxCPM2* \"$CACHE\"/huggingface"
else
  echo "==> Beholdt $APP_DIR (venv, config.json med nøkkelen, modellene, referansene). Slett alt med ./uninstall.sh --purge"
fi
