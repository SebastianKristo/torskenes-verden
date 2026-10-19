FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production TZ=Europe/Oslo DATA_DIR=/data PORT=3000 OCR_FALLBACK=on
# smbclient: backup av FinansHub til SMB-share (Innstillinger → Backup og data).
# tesseract-ocr (+ nor/eng): lokal OCR-reserve for kvitteringer når AI feiler (OCR_FALLBACK=on|off).
# imagemagick: forbehandling (gråtoner, skjevhet, terskel) og beskjæring etter Roboflow. zbar-tools: strekkoder og QR.
RUN apt-get update && apt-get install -y --no-install-recommends smbclient tesseract-ocr tesseract-ocr-nor tesseract-ocr-eng imagemagick zbar-tools \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json CHANGELOG.md ./
COPY server ./server
COPY public ./public
COPY scripts ./scripts
COPY docker-entrypoint.sh /usr/local/bin/
RUN mkdir -p /data
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
