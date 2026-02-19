const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const cron = require('node-cron');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');

// Adiciona o plugin de stealth para evitar detecção de robôs
chromium.use(stealth);

// ==========================================
// CONFIGURAÇÃO
// ==========================================
const AGENDAMENTO = '50 9 * * *'; // Todos os dias às 09:50
const TELEFONE_DESTINO = '5511975040117';
const PORT = process.env.PORT || 3000;

let lastQrCode = null;

// Servidor Express para ver o QR Code no navegador
const app = express();
app.get('/', (req, res) => {
    if (!lastQrCode) return res.send('<h1>Aguardando QR Code...</h1><p>Se o QR Code já foi escaneado, o sistema está pronto.</p>');

    QRCode.toDataURL(lastQrCode, (err, url) => {
        if (err) return res.status(500).send('Erro ao gerar imagem do QR Code');
        res.send(`
            <div style="text-align: center; font-family: sans-serif; padding: 50px;">
                <h1>Escaneie o WhatsApp</h1>
                <p>Abra o WhatsApp no celular 11-97504-0117 e escaneie o código abaixo:</p>
                <img src="${url}" style="width: 300px; border: 10px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.1);" />
                <p style="color: gray; margin-top: 20px;">O robô enviará os resultados automaticamente quando a extração terminar.</p>
                <script>setTimeout(() => location.reload(), 10000);</script>
            </div>
        `);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor Web ativo na porta ${PORT}`);
    console.log(`🔗 Você pode visualizar o QR Code acessando a URL da Back4App`);
});

// Inicialização do WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    }
});

client.on('qr', (qr) => {
    lastQrCode = qr;
    console.log('📱 WHATSAPP: Novo QR Code gerado.');
    qrcodeTerminal.generate(qr, { small: true });
});

client.on('ready', () => {
    lastQrCode = null;
    console.log('✅ WHATSAPP: Cliente pronto e conectado!');
});

client.on('authenticated', () => {
    console.log('🔓 WHATSAPP: Autenticado com sucesso!');
});

client.initialize();

// Agendamento do Cron
cron.schedule(AGENDAMENTO, () => {
    const agora = new Date().toLocaleString();
    console.log(`\n⏰ [${agora}] Iniciando execução agendada...`);
    if (fs.existsSync('resultados.txt')) fs.unlinkSync('resultados.txt');
    ejetaScraper();
});

async function ejetaScraper() {
    try {
        await scrape();
        await sendWhatsApp();
    } catch (err) {
        console.error("💥 Erro no processo completo:", err);
    }
}

async function sendWhatsApp() {
    try {
        if (!fs.existsSync('resultados.txt')) return;
        const media = MessageMedia.fromFilePath('resultados.txt');
        const chat = await client.getChatById(`${TELEFONE_DESTINO}@c.us`);
        await chat.sendMessage(media, { caption: '📄 Resultados OLX Barueri.' });
        console.log("🚀 WHATSAPP: Arquivo enviado!");
    } catch (err) {
        console.error("❌ WHATSAPP Error:", err.message);
    }
}

async function scrape() {
    console.log("🚀 OLX: Iniciando extração...");
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    const initialUrl = 'https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/barueri?ps=1&pe=20000000&sp=6&f=p&o=1';

    try {
        await page.goto(initialUrl, { waitUntil: 'load', timeout: 90000 });
        const allData = [];
        const adUrls = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            return Array.from(new Set(links.map(a => a.href).filter(h => /\/imoveis\/.*-\d+$/.test(h) && !h.includes('/venda/'))));
        });

        const targetUrls = adUrls.slice(0, 50); // Pegar os primeiros 50

        for (const adUrl of targetUrls) {
            const detailPage = await context.newPage();
            try {
                await detailPage.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
                await detailPage.goto(adUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
                const price = await detailPage.evaluate(() => {
                    const el = document.querySelector('span[data-testid="ad-price"]') || document.querySelector('h2:has-text("R$")');
                    return el ? el.innerText.trim() : "N/A";
                });
                const phone = await detailPage.evaluate(() => {
                    const text = document.body.innerText;
                    const match = text.match(/(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-\s]?\d{4}/);
                    return match ? match[0].trim() : "Não informado";
                });
                allData.push({ link: adUrl, valor: price, telefone: phone });
                generateTxt(allData);
            } catch (e) { } finally { await detailPage.close(); }
            await page.waitForTimeout(1000);
        }
    } finally {
        await browser.close();
    }
}

function generateTxt(data) {
    let content = `=== IMÓVEIS OLX BARUERI ===\nData: ${new Date().toLocaleString()}\n\n`;
    data.forEach((item, i) => {
        content += `${i + 1}. [VALOR: ${item.valor}] [FONE: ${item.telefone}]\n   LINK: ${item.link}\n----------------------------------------------------\n`;
    });
    fs.writeFileSync('resultados.txt', content, 'utf8');
}
