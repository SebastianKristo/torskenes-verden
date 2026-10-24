#!/bin/bash
# vision-ocr – fjern tjenesten fra Mac mini-en.
#
#   ./uninstall.sh           # stopper og fjerner LaunchAgent og binæren, beholder config.json (nøkkelen) og loggen
#   ./uninstall.sh --purge   # fjerner også config.json med nøkkelen og loggen
set -euo pipefail

LABEL="com.local.vision-ocr"
APP_DIR="$HOME/Library/Application Support/vision-ocr"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/vision-ocr.log"
PURGE=0

case "${1:-}" in
  "") ;;
  --purge) PURGE=1 ;;
  -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
  *) printf 'Ukjent valg: %s (bruk --purge eller --help)\n' "$1" >&2; exit 1 ;;
esac

[ "$(uname -s)" = "Darwin" ] || { echo "Kjøres på Mac-en (macOS)." >&2; exit 1; }
[ "$(id -u)" -ne 0 ] || { echo "Ikke kjør med sudo/root." >&2; exit 1; }

UID_NUM="$(id -u)"
for d in "gui/$UID_NUM" "user/$UID_NUM"; do
  if launchctl print "$d/$LABEL" >/dev/null 2>&1; then
    echo "==> Stopper $LABEL ($d)"
    launchctl bootout "$d/$LABEL" 2>/dev/null || true
  fi
done

if [ -f "$PLIST" ]; then rm -f "$PLIST"; echo "==> Fjernet $PLIST"; fi
if [ -f "$APP_DIR/vision-ocr" ]; then rm -f "$APP_DIR/vision-ocr"; echo "==> Fjernet binæren"; fi

if [ "$PURGE" = 1 ]; then
  rm -rf "$APP_DIR"
  rm -f "$LOG"
  echo "==> Fjernet $APP_DIR (med nøkkelen) og $LOG"
  echo "    Fjern også macOcrUrl/macOcrKey i Homelab › Innstillinger, eller slå av Mac-OCR der."
else
  echo "==> Beholdt $APP_DIR/config.json (nøkkel) og $LOG. Bruk --purge for å slette dem."
fi

FW=/usr/libexec/ApplicationFirewall/socketfilterfw
if [ -x "$FW" ] && "$FW" --listapps 2>/dev/null | grep -q "vision-ocr"; then
  echo "    Brannmurregelen kan fjernes med: sudo $FW --remove \"$APP_DIR/vision-ocr\""
fi
echo "Ferdig."
