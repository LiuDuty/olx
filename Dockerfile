# Usar imagem oficial do Node com suporte a navegadores
FROM ghcr.io/puppeteer/puppeteer:latest

USER root

# Instalar dependências adicionais para o Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    librandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libm12 \
    libxshmfence1 \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências do projeto
RUN npm install

# Copiar o resto do código
COPY . .

# Expor a porta para visualização do QR Code
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]
