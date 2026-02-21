---
title: OLX Robot
emoji: 🤖
colorFrom: green
colorTo: blue
sdk: docker
pinned: false
---

# OLX Scraper Pro 🚀

Sistema avançado de extração e gestão de imóveis do OLX com integração Back4App (MongoDB) e Interface Web Moderna.

## ✨ Novidades
- **Base de Dados Cloud**: Integração total com Back4App. Nada de arquivos locais perdidos.
- **Web App Premium**: Dashboard responsivo (Mobile-Ready) para gerir os anúncios.
- **Sistema de Favoritos**: Marque os melhores imóveis com uma estrela.
- **Filtro de Ignorados**: Itens marcados como ignorados não são mais baixados nem atualizados.
- **Observações**: Agora você pode salvar notas personalizadas em cada anúncio.
- **Agendamento Dinâmico**: Controle o horário da próxima extração diretamente pelo banco de dados ou UI.

## 🛠️ Tecnologias
- **Backend**: Node.js, Express, Playwright (Stealth), Parse SDK.
- **Frontend**: React, Vite, Framer Motion, Lucide Icons, CSS Glassmorphism.
- **DB**: MongoDB (via Back4App).
- **Notificação**: WhatsApp (whatsapp-web.js).

## 🚀 Como Rodar
1. Instale as dependências: `npm install`
2. Configure o `.env` com suas chaves do Back4App.
3. Construa a UI: `npm run build:ui`
4. Inicie o sistema: `npm start`
5. Acesse `http://localhost:3000` para ver o Dashboard.
6. Acesse `http://localhost:3000/qr` para conectar o WhatsApp.

## 📱 Web App
O Web App permite:
- Ver todos os imóveis extraídos.
- Adicionar notas e marcar favoritos.
- Ignorar anúncios indesejados (eles não aparecerão em futuras extrações).
- Disparar a extração manualmente.
- Ajustar o agendamento.
 (Back4App)

Este projeto automatiza a extração de anúncios da OLX (Proprietários) e envia para o WhatsApp.

## Como Visualizar o QR Code

Ao subir para a **Back4App**, você não precisa depender apenas dos logs do terminal para ver o QR Code.

1.  Acesse a **URL Pública** que a Back4App fornece para o seu aplicativo (ex: `https://olx-scraper.back4app.io`).
2.  O QR Code aparecerá diretamente no seu **navegador**.
3.  Escaneie com o celular `11-97504-0117`.
4.  Uma vez conectado, o navegador exibirá uma mensagem de confirmação.

## Configuração Diária
- O robô roda todos os dias às **09:05**.
- Ele envia o arquivo `resultados.txt` para o número configurado.
- A sessão fica salva na pasta `.wwebjs_auth` para evitar novos scaneamentos após reinicializações.

## Como Rodar Localmente
```bash
npm install
npm start
```

## Arquivos no Git
- `scraper.js`: Lógica principal e servidor web para o QR Code.
- `Dockerfile`: Configuração para rodar na nuvem com todas as dependências do Chrome.
- `.wwebjs_auth/`: (Ignorado pelo git por segurança) Contém sua sessão logada.
