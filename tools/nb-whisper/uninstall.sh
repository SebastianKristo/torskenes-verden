#!/bin/bash
# nb-whisper – fjern LaunchAgenten com.local.nb-whisper (prompt 54).
#   ./uninstall.sh          # stopper og fjerner agenten, beholder venv, config.json (nøkkelen) og modellen
#   ./uninstall.sh --purge  # sletter også venv, config.json, modellene i standardmappa og loggen
set -euo pipefail
APP_DIR="$HOME/Library/Application Support/nb-whisper"
LABEL="com.local.nb-whisper"
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
  rm -rf "$APP_DIR" "$HOME/Library/Logs/nb-whisper.log"
  echo "==> Slettet $APP_DIR (venv, config.json, modellene i standardmappa) og loggen."
  [ -z "$CACHE" ] || echo "    Modellene i --cache-dir er beholdt. Slett dem med: rm -rf \"$CACHE\"/nb-whisper-* \"$CACHE\"/huggingface"
else
  echo "==> Beholdt $APP_DIR (venv, config.json med nøkkelen, modellen). Slett alt med ./uninstall.sh --purge"
fi
