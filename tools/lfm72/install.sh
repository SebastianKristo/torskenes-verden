#!/bin/bash
# lfm72 – hent LFM-visjonsmodellene (Liquid AI) til Ollama eller oMLX på Mac mini-en, for kvitterings-evalen. Prompt 72 (LFM72).
#
#   ./install.sh                         # Ollama: ollama pull av LFM3-VL-2B og LFM2.5-VL-3B (GGUF fra Hugging Face)
#   ./install.sh --omlx                  # oMLX: last ned MLX-versjonene til oMLX sin modellmappe (~/.omlx/models)
#   ./install.sh --omlx --model-dir /Volumes/AI/omlx
#   ./install.sh --lfm3 NAVN --lfm25 NAVN   # andre navn (sjekk dem på Hugging Face først)
#   ./install.sh --check                 # bare sjekk at navnene finnes på Hugging Face (ingen nedlasting)
#
# Modellfilene havner aldri i repoet. Lisensen er «LFM Open License» – les den på Hugging Face før du tar modellene i bruk
# (se tools/lfm72/README.md). Ingenting her endrer Homelab-innstillingene: motorene slås på under AI → Kvitteringer (bare admin).
# Fungerer med macOS sin bash 3.2.
set -euo pipefail

OLLAMA_LFM3="hf.co/LiquidAI/LFM3-VL-2B-GGUF"
OLLAMA_LFM25="hf.co/LiquidAI/LFM2.5-VL-3B-GGUF"
MLX_LFM3="mlx-community/LFM3-VL-2B-4bit"
MLX_LFM25="mlx-community/LFM2.5-VL-3B-4bit"
OMLX=0; CHECK=0; MODEL_DIR="$HOME/.omlx/models"; LFM3=""; LFM25=""

die() { printf '\nFeil: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --omlx) OMLX=1 ;;
    --check) CHECK=1 ;;
    --model-dir) MODEL_DIR="${2:?}"; shift ;;
    --lfm3) LFM3="${2:?}"; shift ;;
    --lfm25) LFM25="${2:?}"; shift ;;
    -h|--help) usage ;;
    *) die "Ukjent valg $1 (se --help)" ;;
  esac
  shift
done
if [ "$OMLX" = 1 ]; then LFM3="${LFM3:-$MLX_LFM3}"; LFM25="${LFM25:-$MLX_LFM25}"; else LFM3="${LFM3:-$OLLAMA_LFM3}"; LFM25="${LFM25:-$OLLAMA_LFM25}"; fi

# Repo-ID på Hugging Face: «hf.co/Org/Navn[:kvant]» → «Org/Navn».
repo_of() { printf '%s' "$1" | sed -e 's#^hf\.co/##' -e 's#^huggingface\.co/##' -e 's#:.*$##'; }
check_hf() {
  local repo; repo="$(repo_of "$1")"
  local code; code="$(curl -s -o /dev/null -w '%{http_code}' "https://huggingface.co/api/models/$repo" || true)"
  case "$code" in
    200) info "Fant $repo på Hugging Face" ;;
    401|403) info "$repo krever innlogging/godkjent lisens på Hugging Face (HTTP $code) – godta lisensen på modellsiden og kjør 'hf auth login'" ;;
    *) die "Fant ikke $repo på Hugging Face (HTTP $code). Sjekk navnet på https://huggingface.co/LiquidAI og bruk --lfm3/--lfm25." ;;
  esac
}

check_hf "$LFM3"
check_hf "$LFM25"
[ "$CHECK" = 1 ] && exit 0

if [ "$OMLX" = 0 ]; then
  command -v ollama >/dev/null 2>&1 || die "Fant ikke ollama. Installer Ollama først (brew install ollama)."
  info "ollama pull $LFM3"; ollama pull "$LFM3"
  info "ollama pull $LFM25"; ollama pull "$LFM25"
  info "Ferdig. Sjekk at bildestøtten er med: ollama show $LFM3   (Capabilities skal ha «vision»)"
else
  PY=""
  for p in "$(brew --prefix omlx 2>/dev/null)/libexec/bin/python" "$HOME/Library/Application Support/omlx58/venv/bin/python" "$(command -v python3 || true)"; do
    [ -x "$p" ] && "$p" -c 'import huggingface_hub' 2>/dev/null && { PY="$p"; break; }
  done
  [ -n "$PY" ] || die "Fant ingen Python med huggingface_hub. Kjør tools/omlx/install.sh først, eller: python3 -m pip install huggingface_hub"
  for m in "$LFM3" "$LFM25"; do
    info "Laster ned $m til $MODEL_DIR/$m"
    "$PY" - "$m" "$MODEL_DIR/$m" <<'PYEOF'
import sys
from huggingface_hub import snapshot_download
snapshot_download(repo_id=sys.argv[1], local_dir=sys.argv[2], allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model", "*.tiktoken", "*.jinja", "*.py"])
PYEOF
  done
  info "Ferdig. Start oMLX på nytt så modellene dukker opp i /v1/models: launchctl kickstart -k gui/\$(id -u)/com.local.omlx58"
fi
cat <<MSG

Kjør evalen (på Mac-en, fra repoet):
  node eval/receipts72.mjs --dir ~/Kvitteringer/eval --ollama http://127.0.0.1:11434$( [ "$OMLX" = 1 ] && printf ' --lfm-backend omlx --omlx http://127.0.0.1:18040 --omlx-key <nøkkel>' )
MSG
