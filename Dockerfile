FROM node:18-bookworm-slim

# Dependências básicas
RUN apt-get update && apt-get install -y \
    procps \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências do Scraper
COPY package*.json ./
RUN npm install

# Build da Interface (Frontend)
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Copia o restante do código (scraper, db.js, etc)
COPY . .

# Porta padrão
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Comando para iniciar
CMD ["node", "scraper.js"]
