FROM node:18-bookworm-slim

# Instalar apenas o básico para o Node
RUN apt-get update && apt-get install -y \
    procps \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm install

# Copiar código
COPY . .

# Porta 7860 (Hugging Face Default)
EXPOSE 7860

# Iniciar
CMD ["node", "scraper.js"]
