FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y curl tesseract-ocr tesseract-ocr-fin tesseract-ocr-swe tesseract-ocr-deu tesseract-ocr-frk wget unzip

# Install Node.js
ENV NODE_VERSION 20.15.0
ENV NVM_VERSION 0.39.7 
ENV NVM_DIR /usr/local/nvm

RUN mkdir -p $NVM_DIR \
  && curl https://raw.githubusercontent.com/creationix/nvm/v$NVM_VERSION/install.sh | bash \
  && . $NVM_DIR/nvm.sh \
  && nvm install $NODE_VERSION \
  && nvm alias default $NODE_VERSION \
  && nvm use default \
  && node -v \
  && npm -v

# Update the $PATH to make your installed `node` and `npm` available!
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

COPY package.json /src/package.json
RUN cd /src; npm install

COPY fi_frak_nlf.traineddata /usr/share/tesseract-ocr/5/tessdata

RUN useradd -rm -d /home/node -s /bin/bash  -u 1001 node

COPY --chown=node . /src
WORKDIR /src


# ADD HERE OCR LANGUAGES THAT YOU NEED
# RUN apt-get install -y tesseract-ocr-deu

USER node
CMD ["node", "index.mjs"]
