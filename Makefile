# Homelab – hjelpemål. (npm-skriptene i package.json er fortsatt hovedinngangen.)

OLLAMA ?= http://localhost:11434
MODEL ?= qwen3:8b
ARGS ?=

.PHONY: eval-receipts eval-receipts-mock receipts-fixtures

# Prompt 48: kvitterings-eval mot ekte modell (Ollama), ekte Mac-OCR og Tesseract. Se tests/receipts/README.md.
#   make eval-receipts
#   make eval-receipts OLLAMA=http://10.69.1.173:11434 ARGS="--case lang --runs 3"
eval-receipts:
	node tests/receipts/run.mjs --ollama $(OLLAMA) --model $(MODEL) $(ARGS)

# Samme rigg med falsk modell, Mac-OCR, Tesseract og Gemini (ingen nett) – for CI.
eval-receipts-mock:
	node tests/receipts/run.mjs --mock $(ARGS)

# Lager de syntetiske kvitteringene på nytt (krever python3 + Pillow).
receipts-fixtures:
	python3 tests/receipts/gen-fixtures.py
