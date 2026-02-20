# Usar imagem oficial do Node baseada em Debian Bookworm
FROM node:18-bookworm

# Instalar Chromium e dependências
RUN apt-get update && apt-get install -y \
    chromium fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates libappindicator1 lsb-release xdg-utils wget libdrm2 libxkbcommon0 libxshmfence1 procps \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Criar a pasta como root e dar a permissão antes de trocar de usuário
RUN mkdir -p /home/node/app && chown -R node:node /home/node/app

WORKDIR /home/node/app

# Mudar para o usuário node (UID 1000)
USER node

# Copiar arquivos de dependências
COPY --chown=node:node package*.json ./

# Instalar dependências
RUN npm install

# Copiar o resto do código
COPY --chown=node:node . .

EXPOSE 7860
CMD ["npm", "start"]
