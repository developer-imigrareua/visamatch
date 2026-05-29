FROM node:20-alpine

WORKDIR /app

# Instala dependências primeiro (cache de camadas)
COPY package.json ./
RUN npm install --production

# Copia código
COPY src/ ./src/

# Porta interna do container
EXPOSE 3000

CMD ["node", "src/index.js"]
