FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-fin \
    tesseract-ocr-swe \
    tesseract-ocr-deu \
    tesseract-ocr-frk \
    curl \
    wget \
    unzip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json /src/package.json
COPY package-lock.json /src/package-lock.json
RUN cd /src; npm ci

COPY fi_frak_nlf.traineddata /usr/share/tesseract-ocr/5/tessdata

#RUN useradd -rm -d /home/node -s /bin/bash  -u 1001 node

COPY --chown=node . /src
WORKDIR /src


# ADD HERE OCR LANGUAGES THAT YOU NEED
# RUN apt-get install -y tesseract-ocr-deu

USER node
CMD ["node", "index.mjs"]
