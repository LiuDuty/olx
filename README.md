# Scraper OLX Barueri + Envio por WhatsApp (Back4App)

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
