# Usar imagem oficial do Node baseada em Debian Bookworm
FROM node:18-bookworm

# 1. Instalar dependências básicas
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    xvfb \
    xauth \
    dbus-x11 \
    --no-install-recommends

# 2. Instalar Google Chrome Stable (Oficial)
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y \
    google-chrome-stable \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 3. Configurar caminhos
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# 4. Configurar usuário (UID 1000 que o HF exige)
RUN mkdir -p /home/node/app && chown -R node:node /home/node/app
WORKDIR /home/node/app
USER node

# 5. Instalar Node Modules
COPY --chown=node:node package*.json ./
RUN npm install

# 6. Copiar Código
COPY --chown=node:node . .

EXPOSE 7860

# Usar node diretamente para garantir visibilidade de logs
CMD ["node", "scraper.js"]
