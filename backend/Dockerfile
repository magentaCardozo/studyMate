# StudyMate AI — API et worker (même image, commande différente)
# Contexte de build : racine du dépôt (pour inclure shared/api-contracts/openapi.yaml)
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
WORKDIR /app
# openssl : moteur Prisma ; poppler + tesseract : rendu et OCR ; python3 : méthode d'extraction locale
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates poppler-utils tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng tesseract-ocr-osd python3 python3-pip \
  && pip3 install --no-cache-dir --break-system-packages pypdf==5.4.0 pymupdf==1.25.5 \
  && rm -rf /var/lib/apt/lists/*
# Méthode d'extraction OCR (backend/ocr) avec un tessdata local (fra, eng, osd) et un cache par empreinte MD5.
COPY backend/ocr /app/ocr
RUN mkdir -p /app/ocr/tessdata /app/cache_ocr \
  && cp /usr/share/tesseract-ocr/5/tessdata/fra.traineddata /usr/share/tesseract-ocr/5/tessdata/eng.traineddata /usr/share/tesseract-ocr/5/tessdata/osd.traineddata /app/ocr/tessdata/ \
  && chown -R node:node /app/cache_ocr
ENV OCR_SCRIPT=/app/ocr/studymate_ocr.py OCR_CACHE_DIR=/app/cache_ocr STUDYMATE_TESSDATA=/app/ocr/tessdata

FROM base AS build
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/prisma ./prisma
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build

# Étape de test : docker compose --profile test run --rm backend-tests
FROM build AS test
COPY backend/vitest.config.ts ./
COPY backend/tests ./tests
CMD ["npx", "vitest", "run"]

FROM build AS prod-deps
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY backend/package.json ./
COPY shared/api-contracts/openapi.yaml ./openapi.yaml
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
