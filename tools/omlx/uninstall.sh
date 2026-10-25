#!/bin/bash
# omlx – fjern LaunchAgenten com.local.omlx58 (prompt 58).
#   ./uninstall.sh            # stopper og fjerner agenten (oMLX og vakten), beholder config.json (nøkkelen), modellene og Homebrew-pakken
#   ./uninstall.sh --purge    # sletter også ~/Library/Application Support/omlx58 og loggen (modellene og SSD-cachen beholdes)
#   ./uninstall.sh --brew     # avinstallerer også Homebrew-pakken omlx (brew uninstall omlx && brew untap jundot/omlx)
# Modellene ligger i modellmappen (standard ~/.omlx/models) og KV-cachen i ~/.omlx/cache. Slett dem selv hvis du vil ha plassen:
#   rm -rf ~/.omlx/models/mlx-community/Qwen3-8B-4bit ~/.omlx/models/mlx-community/Qwen2.5-VL-7B-Instruct-4bit ~/.omlx/cache
set -euo pipefail
APP_DIR="$HOME/Library/Application Support/omlx58"
LABEL="com.local.omlx58"
PURGE=0; BREW=0
for a in "$@"; do
  case "$a" in
    --purge) PURGE=1 ;;
    --brew) BREW=1 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "Ukjent valg: $a" >&2; exit 1 ;;
  esac
done
[ "$(uname -s)" = "Darwin" ] || { echo "Kjøres på Mac mini-en." >&2; exit 1; }
UID_NUM="$(id -u)"
for d in "gui/$UID_NUM" "user/$UID_NUM"; do launchctl bootout "$d/$LABEL" 2>/dev/null || true; done
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "==> Fjernet $LABEL (oMLX og vakten er stoppet)"
if [ "$PURGE" = 1 ]; then
  rm -rf "$APP_DIR" "$HOME/Library/Logs/omlx58.log"
  echo "==> Slettet $APP_DIR og loggen. Modellene og SSD-cachen ligger fortsatt i modellmappen (standard ~/.omlx)."
else
  echo "==> Beholdt $APP_DIR (config.json med nøkkelen). Slett med ./uninstall.sh --purge"
fi
if [ "$BREW" = 1 ] && command -v brew >/dev/null 2>&1; then
  brew services stop omlx >/dev/null 2>&1 || true
  brew uninstall omlx || true
  brew untap jundot/omlx || true
  echo "==> Avinstallerte Homebrew-pakken omlx"
fi
echo "    Husk å fjerne adressen i Homelab (AI-kontroll › Modeller › oMLX), ellers står oppgaver på oMLX og bruker Ollama-reserven."
