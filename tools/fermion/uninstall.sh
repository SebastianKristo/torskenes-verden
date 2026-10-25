#!/bin/bash
# fermion – fjern LaunchAgentene com.local.fermion-neutrino og com.local.fermion-phonon (prompt 53).
#   ./uninstall.sh          # stopper og fjerner agentene, beholder venv, config.json (nøkkelen) og modellene
#   ./uninstall.sh --purge  # sletter også venv, config.json og loggene (modellene i Hugging Face-cachen beholdes)
set -euo pipefail
APP_DIR="$HOME/Library/Application Support/fermion"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1
[ "$(uname -s)" = "Darwin" ] || { echo "Kjøres på Mac mini-en." >&2; exit 1; }
UID_NUM="$(id -u)"
for svc in neutrino phonon; do
  label="com.local.fermion-$svc"
  for d in "gui/$UID_NUM" "user/$UID_NUM"; do launchctl bootout "$d/$label" 2>/dev/null || true; done
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
  echo "==> Fjernet $label"
done
if [ "$PURGE" = 1 ]; then
  rm -rf "$APP_DIR" "$HOME/Library/Logs/fermion-neutrino.log" "$HOME/Library/Logs/fermion-phonon.log"
  echo "==> Slettet $APP_DIR og loggene. Modellene ligger fortsatt i Hugging Face-cachen (eller --cache-dir); slett dem med:"
  echo "    rm -rf ~/.cache/huggingface/hub/models--FermionResearch--*"
else
  echo "==> Beholdt $APP_DIR (venv, config.json med nøkkelen). Slett alt med ./uninstall.sh --purge"
fi
