FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# Prompt 53 (DAL53): onnxruntime-node (Voz) skal ikke hente CUDA-binærer fra NuGet under bygget – Voz kjører på CPU.
ENV ONNXRUNTIME_NODE_INSTALL=skip
RUN npm ci --omit=dev
# Prompt 53 (DAL53): Desert Ant Labs-pakkene har native kjerner for linux-x64, linux-arm64 og darwin-arm64 pluss en WebAssembly-kopi
# for nettleseren. Serveren bruker bare den native kjernen for sin egen arkitektur (Voz bruker wasm), så resten fjernes (~0,8 GB mindre).
RUN set -e; A="$(node -p 'process.platform + "-" + process.arch')"; \
  for d in node_modules/@desert-ant-labs/*/native/*; do [ -d "$d" ] && [ "$(basename "$d")" != "$A" ] && rm -rf "$d"; done; \
  for p in eye redact gist emo moderator clear; do rm -f node_modules/@desert-ant-labs/$p/dist/*.wasm; done; \
  find node_modules/onnxruntime-node/bin -mindepth 3 -maxdepth 3 -type d ! -path "*/linux/$(node -p 'process.arch')*" -exec rm -rf {} + 2>/dev/null || true

# Prompt 51 (OPS51): restic for backupen (3-2-1, Innstillinger → System). Fast versjon og sjekksum fra restic sine egne utgivelser.
FROM node:22-bookworm-slim AS restic
ARG TARGETARCH
ARG RESTIC_VERSION=0.17.3
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates bzip2 && rm -rf /var/lib/apt/lists/* \
  && ARCH="${TARGETARCH:-amd64}" \
  && case "$ARCH" in amd64) SUM=5097faeda6aa13167aae6e36efdba636637f8741fed89bbf015678334632d4d3 ;; arm64) SUM=db27b803534d301cef30577468cf61cb2e242165b8cd6d8cd6efd7001be2e557 ;; *) echo "restic: ukjent arkitektur $ARCH" >&2; exit 1 ;; esac \
  && curl -fsSL -o /tmp/restic.bz2 "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_${ARCH}.bz2" \
  && echo "$SUM  /tmp/restic.bz2" | sha256sum -c - && bunzip2 /tmp/restic.bz2 && install -m 0755 /tmp/restic /usr/local/bin/restic

FROM node:22-bookworm-slim
ENV NODE_ENV=production TZ=Europe/Oslo DATA_DIR=/data PORT=3000 OCR_FALLBACK=on
# smbclient: backup av FinansHub til SMB-share (Innstillinger → Backup og data).
# tesseract-ocr (+ nor/eng): lokal OCR-reserve for kvitteringer når AI feiler (OCR_FALLBACK=on|off).
# imagemagick: forbehandling (gråtoner, skjevhet, terskel) og beskjæring etter Roboflow. zbar-tools: strekkoder og QR.
# Prompt 45: poppler-utils (pdftotext/pdftoppm: tekstlaget i PDF-er og skannede sider som bilder) og libheif-examples (heif-convert: HEIC → JPG)
# for Studie → vitnemål. Uten dem fant analysen ingen fag i ekte PDF-er (innebygde skrifter) og skannede dokumenter.
# Prompt 53 (DAL53): ffmpeg (lyd → 16 kHz til tale til tekst) og libcurl4 + ca-certificates (Desert Ant Labs-kjernen laster ned vekter og lisenser med den over HTTPS).
RUN apt-get update && apt-get install -y --no-install-recommends smbclient tesseract-ocr tesseract-ocr-nor tesseract-ocr-eng imagemagick zbar-tools poppler-utils libheif-examples ffmpeg libcurl4 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=restic /usr/local/bin/restic /usr/local/bin/restic
COPY package.json CHANGELOG.md ./
COPY server ./server
COPY shared ./shared
COPY public ./public
COPY scripts ./scripts
COPY eval ./eval
COPY docker-entrypoint.sh /usr/local/bin/
RUN mkdir -p /data
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
