FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y curl tesseract-ocr tesseract-ocr-fin tesseract-ocr-swe wget unzip

# Install Node.js
RUN apt-get install --yes curl
RUN curl --silent --location https://deb.nodesource.com/setup_18.x | bash -
RUN apt-get install -y nodejs

RUN cd /src; wget https://github.com/qpdf/qpdf/releases/download/v11.1.0/qpdf-11.1.0-bin-linux-x86_64.zip; unzip qpdf-11.1.0-bin-linux-x86_64.zip

COPY package.json /src/package.json
RUN cd /src; npm install

RUN useradd -rm -d /home/node -s /bin/bash  -u 1000 node

COPY --chown=node . /src
WORKDIR /src


# ADD HERE OCR LANGUAGES THAT YOU NEED
RUN apt-get install -y tesseract-ocr-fin tesseract-ocr-swe tesseract-ocr-deu

USER node
CMD ["node", "index.js"]
