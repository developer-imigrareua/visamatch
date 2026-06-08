FROM node:22-alpine

WORKDIR /app

COPY backend/package.json ./
RUN npm install --production

COPY backend/src/ ./src/
COPY frontend/ ./frontend/
COPY admin/ ./admin/

EXPOSE 3000

CMD ["node", "src/index.js"]
