FROM node:12.18.3-slim

RUN apt-get update \
    && apt-get install -y \
WORKDIR /usr/src/app
COPY package*.json ./
COPY . .
RUN npm install
CMD [ "node", "src/index.js" ]