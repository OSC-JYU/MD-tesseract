FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-fin \
    tesseract-ocr-swe \
    tesseract-ocr-deu \
    tesseract-ocr-frk \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY fi_frak_nlf.traineddata /usr/share/tesseract-ocr/5/tessdata

COPY --chown=node index.mjs service.json README.md ./
COPY --chown=node help ./help
COPY --chown=node lib ./lib

RUN mkdir -p /src/uploads /src/data \
  && chown -R node:node /src/uploads /src/data

# ADD HERE OCR LANGUAGES THAT YOU NEED
# RUN apt-get install -y tesseract-ocr-deu

USER node
CMD ["node", "index.mjs"]
