const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const express = require('express');
const Parse = require('./db');
const { DateTime } = require('luxon');
const https = require('https');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');

console.log('🚀 [Boot] O script scraper.js começou a rodar!');
console.log('📅 [Boot] Hora Atual:', new Date().toISOString());

// Helper para usar Master Key apenas se ela estiver configurada
const getOptions = () => Parse.hasMasterKey ? { useMasterKey: true } : {};

// Adiciona o plugin de stealth
chromium.use(stealth);

// ==========================================
// CONFIGURAÇÃO
// ==========================================
const TELEFONE_DESTINO = process.env.TELEFONE_DESTINO || '5511975040117';
const PORT = process.env.PORT || 3000;
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '2U1KDYckXbPO4pc065f0e047f92f67e4ab2dbe8e65ac0fd55';
const BROWSERLESS_WS = `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}`;

let lastQrCode = null;
let isScraping = false;
let whatsappStatus = 'Iniciando...';

// ==========================================
// SERVIDOR EXPRESS
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Check de Saúde
app.get('/', (req, res) => res.send('🚀 OLX Backend API is Online!'));

app.get('/api/health', (req, res) => res.json({
    status: 'API Online',
    serverTime: new Date(),
    whatsapp: whatsappStatus
}));

app.get('/api/whatsapp-status', (req, res) => {
    res.json({ status: whatsappStatus, hasQr: !!lastQrCode });
});

// ==========================================
// PÁGINA DO QR CODE (Renderizado no CLIENTE)
// ==========================================
app.get('/qr', (req, res) => {
    if (!lastQrCode) {
        return res.send(`<!DOCTYPE html>
<html><head><title>WhatsApp QR</title></head>
<body style="text-align:center;padding:50px;font-family:Arial;background:#fff;">
    <h2>🤖 Status: ${whatsappStatus}</h2>
    <p>Aguardando QR Code... Atualizando em 3 segundos.</p>
    <script>setTimeout(()=>location.reload(),3000)</script>
</body></html>`);
    }

    // Usa JSON.stringify para escapar o QR de forma segura
    const qrJson = JSON.stringify(lastQrCode);

    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp QR Code</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        body { text-align:center; padding:20px; font-family:Arial; background:#fff; margin:0; }
        h1 { color:#25D366; margin:0 0 5px 0; }
        p { color:#555; margin:5px 0; }
        #qrcode { display:inline-block; margin:15px; padding:15px; border:5px solid #25D366; border-radius:12px; }
        #qrcode img, #qrcode canvas { display:block; }
    </style>
</head>
<body>
    <h1>📱 Escaneie para Conectar</h1>
    <p>WhatsApp &gt; Aparelhos Conectados &gt; Conectar Aparelho</p>
    <div id="qrcode"></div>
    <p>Status: <b style="color:#25D366">${whatsappStatus}</b></p>
    <p style="color:#999;font-size:0.85em">Atualiza automaticamente a cada 30s</p>
    <script>
        var qrData = ${qrJson};
        new QRCode(document.getElementById("qrcode"), {
            text: qrData,
            width: 320,
            height: 320,
            correctLevel: QRCode.CorrectLevel.L
        });
        setTimeout(function(){ location.reload(); }, 30000);
    </script>
</body>
</html>`);
});

// ==========================================
// ROTAS DE STATUS E CONFIGURAÇÃO
// ==========================================
app.get('/api/status', async (req, res) => {
    try {
        const ScraperStatus = Parse.Object.extend("ScraperStatus");
        const query = new Parse.Query(ScraperStatus);
        const status = await query.first(getOptions());
        if (status) {
            res.json(status.toJSON());
        } else {
            res.json({ message: 'Aguardando...', progress: 0 });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/config', async (req, res) => {
    try {
        const Config = Parse.Object.extend("Config");
        const query = new Parse.Query(Config);
        const configs = await query.find(getOptions());
        const result = {};
        configs.forEach(c => result[c.get("key")] = c.get("value"));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/set-config', async (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Chave não informada' });
    try {
        const Config = Parse.Object.extend("Config");
        const query = new Parse.Query(Config);
        query.equalTo("key", key);
        let config = await query.first(getOptions());
        if (!config) {
            config = new Config();
            config.set("key", key);
        }
        config.set("value", String(value));
        await config.save(null, getOptions());
        res.json({ success: true, key, value });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/set-schedule', async (req, res) => {
    const { nextRun } = req.body;
    try {
        const Config = Parse.Object.extend("Config");
        const query = new Parse.Query(Config);
        query.equalTo("key", "next_run");
        let config = await query.first(getOptions()) || new Config();
        config.set("key", "next_run");
        config.set("value", nextRun);
        await config.save(null, getOptions());
        res.json({ message: 'Agendamento atualizado', nextRun });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ROTAS DE LISTAGENS
// ==========================================
app.get('/api/listings', async (req, res) => {
    const { filter } = req.query;
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);
        if (filter === 'favorites') query.equalTo("isFavorite", true);
        else if (filter === 'ignored') query.equalTo("status", "ignored");
        else query.equalTo("status", "active");
        query.descending("capturedAt");
        const results = await query.find(getOptions());
        res.json(results.map(r => r.toJSON()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/update-listing', async (req, res) => {
    const { id, updates } = req.body;
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);
        const listing = await query.get(id, getOptions());
        Object.entries(updates).forEach(([key, value]) => listing.set(key, value));
        await listing.save(null, getOptions());
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clear-database', async (req, res) => {
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);
        query.limit(1000);
        const allListings = await query.find(getOptions());
        const count = allListings.length;
        if (count > 0) await Parse.Object.destroyAll(allListings, getOptions());
        console.log(`🧹 BASE LIMPA: ${count} registros removidos.`);
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/run-now', async (req, res) => {
    console.log("🖱️ Comando disparar scraper recebido!");
    if (isScraping) return res.status(400).json({ error: 'Scraper já está rodando' });
    let limit = req.body.limit;
    if (limit === undefined) {
        try {
            const Config = Parse.Object.extend("Config");
            const q1 = new Parse.Query(Config);
            q1.equalTo("key", "limit_enabled");
            const limitEnabledObj = await q1.first(getOptions());
            if (limitEnabledObj && limitEnabledObj.get("value") === "true") {
                const q2 = new Parse.Query(Config);
                q2.equalTo("key", "limit_value");
                const limitValObj = await q2.first(getOptions());
                limit = limitValObj ? parseInt(limitValObj.get("value")) : 50;
            } else {
                limit = 999;
            }
        } catch (e) {
            limit = 50;
        }
    }
    console.log(`🚀 Iniciando execução manual com limite: ${limit}`);
    ejetaScraper(limit);
    res.json({ message: `Scraper iniciado com limite de ${limit} itens` });
});

app.post('/api/whatsapp-reset', async (req, res) => {
    try {
        await client.destroy();
        const authPath = path.join(__dirname, '.wwebjs_auth_hf');
        if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
        res.json({ success: true });
        setTimeout(() => process.exit(0), 1000);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor Web ativo na porta ${PORT}`);

    // Auto-ping dinâmico para evitar hibernação
    const SELF_URL = process.env.APP_URL || `http://localhost:${PORT}`;
    setInterval(() => {
        if (SELF_URL.includes('localhost')) return;
        console.log(`📡 [Keep-Alive] Ping em ${SELF_URL}`);
        const protocol = SELF_URL.startsWith('https') ? https : require('http');
        protocol.get(SELF_URL, () => { }).on('error', (err) => {
            console.error(`❌ [Keep-Alive] Erro: ${err.message}`);
        });
    }, 5 * 60 * 1000);
});

// ==========================================
// WHATSAPP CLIENT
// ==========================================
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth_hf'
    }),
    puppeteer: {
        browserWSEndpoint: BROWSERLESS_WS,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ],
        protocolTimeout: 600000
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018.526-alpha.html'
    }
});

client.on('qr', (qr) => {
    lastQrCode = qr;
    whatsappStatus = 'Aguardando Scan';
    console.log('----------------------------------------------------');
    console.log('📱 QR CODE GERADO! Acesse o link para escanear:');
    console.log('👉 https://liuduty-olx-robot.hf.space/qr');
    console.log('----------------------------------------------------');
    qrcodeTerminal.generate(qr, { small: true });
});

client.on('ready', () => {
    lastQrCode = null;
    whatsappStatus = 'Conectado e Pronto';
    console.log('✅ WHATSAPP: Cliente pronto e conectado!');
});

client.on('authenticated', () => {
    whatsappStatus = 'Autenticado (Carregando...)';
    console.log('🔓 WHATSAPP: Autenticado com sucesso!');
});

client.on('auth_failure', (msg) => {
    whatsappStatus = 'Falha na Autenticação';
    lastQrCode = null;
    console.error('❌ WHATSAPP: Falha na autenticação:', msg);
});

client.on('disconnected', (reason) => {
    whatsappStatus = 'Desconectado';
    lastQrCode = null;
    console.log('❌ WHATSAPP: Cliente desconectado:', reason);
    setTimeout(() => {
        console.log('🔄 Tentando re-inicializar WhatsApp...');
        client.initialize();
    }, 10000);
});

// ==========================================
// INICIALIZAÇÃO DO WHATSAPP
// ==========================================
async function startWhatsApp() {
    console.log("🟢 [WhatsApp] Iniciando...");

    // Limpa sessão antiga para evitar conflitos
    try {
        const rootAuthPath = path.join(__dirname, '.wwebjs_auth_hf');
        if (fs.existsSync(rootAuthPath)) {
            console.log("🧹 [Cleanup] Limpando sessão antiga...");
            fs.rmSync(rootAuthPath, { recursive: true, force: true });
        }
        fs.mkdirSync(rootAuthPath, { recursive: true });
    } catch (e) {
        console.log("⚠️ [Cleanup] Erro na limpeza:", e.message);
    }

    if (process.platform !== 'win32') {
        try { exec('pkill -9 chrome'); } catch (e) { }
    }

    try {
        await client.initialize();
        console.log("✅ [WhatsApp] Inicialização concluída");
    } catch (err) {
        console.error("❌ [WhatsApp] Falha:", err.message);
        whatsappStatus = 'Erro ao carregar';
        console.log("♻️ [WhatsApp] Nova tentativa em 30 segundos...");
        setTimeout(startWhatsApp, 30000);
    }
}

startWhatsApp();

// ==========================================
// LOOP DE AGENDAMENTO
// ==========================================
setInterval(async () => {
    if (isScraping) return;
    try {
        const Config = Parse.Object.extend("Config");
        const query = new Parse.Query(Config);
        const configs = await query.find(getOptions());
        const configMap = {};
        configs.forEach(c => configMap[c.get("key")] = c.get("value"));

        const now = DateTime.now().setZone('America/Sao_Paulo');
        const nextRunStr = configMap["next_run"];

        if (nextRunStr) {
            const nextRunTime = DateTime.fromISO(nextRunStr).setZone('America/Sao_Paulo');
            if (now >= nextRunTime) {
                console.log(`⏰ Iniciando execução agendada...`);
                const tomorrow07 = now.plus({ days: 1 }).set({ hour: 7, minute: 0, second: 0, millisecond: 0 });
                const scheduleQuery = new Parse.Query(Config);
                scheduleQuery.equalTo("key", "next_run");
                let scheduleConfig = await scheduleQuery.first(getOptions());
                if (scheduleConfig) {
                    scheduleConfig.set("value", tomorrow07.toISO());
                    await scheduleConfig.save(null, getOptions());
                }
                let runLimit = configMap["limit_enabled"] === "true" ? (parseInt(configMap["limit_value"]) || 50) : 999;
                ejetaScraper(runLimit);
            }
        } else {
            let defaultRun = now.set({ hour: 7, minute: 0, second: 0, millisecond: 0 });
            if (now > defaultRun) defaultRun = defaultRun.plus({ days: 1 });
            const newConfig = new Config();
            newConfig.set("key", "next_run");
            newConfig.set("value", defaultRun.toISO());
            await newConfig.save(null, getOptions());
            console.log(`🆕 Agendamento padrão criado para: ${defaultRun.toFormat('dd/MM HH:mm')}`);
        }
    } catch (err) {
        console.error("❌ Erro ao verificar agendamento:", err.message);
    }
}, 60000);

// ==========================================
// FUNÇÕES DO SCRAPER
// ==========================================
async function updateScraperStatus(message, progress = 0, currentItem = null, links = []) {
    console.log(`📡 STATUS: ${message} (${progress}%)`);
    try {
        const ScraperStatus = Parse.Object.extend("ScraperStatus");
        const query = new Parse.Query(ScraperStatus);
        let status = await query.first(getOptions());
        if (!status) status = new ScraperStatus();
        status.set("message", message);
        status.set("progress", progress);
        status.set("currentItem", currentItem);
        status.set("links", links);
        status.set("lastUpdate", new Date());
        await status.save(null, getOptions());
    } catch (e) {
        console.error("Erro ao atualizar status:", e.message);
    }
}

async function ejetaScraper(limit = 50) {
    if (isScraping) return;
    isScraping = true;
    const foundLinks = [];
    const newResults = [];
    await updateScraperStatus("Iniciando extração...", 5, null, foundLinks);
    try {
        const results = await scrape(limit, foundLinks, newResults);
        console.log(`📊 Extração finalizada. Total: ${results ? results.length : 0}. Novos: ${newResults.length}`);
        if (newResults.length > 0) {
            await updateScraperStatus(`Finalizado! ${newResults.length} novos registros.`, 100, null, foundLinks);
            await sendWhatsApp(newResults);
        } else {
            await updateScraperStatus("Finalizado. Nenhum registro novo.", 100, null, foundLinks);
        }
    } catch (err) {
        console.error("💥 Erro no processo:", err);
        await updateScraperStatus(`Erro: ${err.message}`, 0);
    } finally {
        isScraping = false;
        setTimeout(() => updateScraperStatus("Aguardando próximo ciclo...", 0), 10000);
    }
}

function generateWhatsAppLink(phone) {
    if (!phone || phone === "Não informado") return null;
    const digits = phone.replace(/\D/g, '');
    const fullNumber = digits.length <= 11 ? '55' + digits : digits;
    const message = encodeURIComponent("Olá! Vi seu anúncio e quero saber mais");
    return `https://wa.me/${fullNumber}?text=${message}`;
}

async function saveSingleListing(item) {
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);
        query.equalTo("link", item.link);
        let listing = await query.first(getOptions());
        const isNew = !listing;
        if (!listing) {
            listing = new Listing();
            listing.set("link", item.link);
        } else if (listing.get("status") === "ignored") {
            return false;
        }
        listing.set("price", item.valor);
        listing.set("phone", item.telefone);
        listing.set("waLink", generateWhatsAppLink(item.telefone));
        listing.set("contactName", item.contactName || "Desconhecido");
        listing.set("lastUpdated", new Date());
        if (isNew) {
            listing.set("status", "active");
            listing.set("isFavorite", false);
            listing.set("notes", "");
            listing.set("capturedAt", new Date());
        }
        await listing.save(null, getOptions());
        console.log(`✅ ${isNew ? 'NOVO' : 'ATUALIZADO'}: ${item.valor} | ${item.link}`);
        return isNew;
    } catch (e) {
        console.error(`❌ Erro ao salvar:`, e.message);
        return false;
    }
}

async function sendWhatsApp(data) {
    try {
        const content = generateSummary(data);
        const chat = await client.getChatById(`${TELEFONE_DESTINO}@c.us`);
        await chat.sendMessage(`🚀 Extração Finalizada!\n\n${content}\n\nConfira no Web App.`);
        console.log("✅ WHATSAPP: Resumo enviado!");
    } catch (err) {
        console.error("❌ WHATSAPP Error:", err.message);
    }
}

function generateSummary(data) {
    let summary = "";
    data.slice(0, 10).forEach((item, i) => {
        const waLink = generateWhatsAppLink(item.telefone);
        summary += `${i + 1}. 💰 ${item.valor}\n👤 ${item.contactName || 'N/A'}\n📞 ${item.telefone}\n🔗 ${item.link}\n💬 ${waLink || 'N/A'}\n\n`;
    });
    if (data.length > 10) summary += `... e mais ${data.length - 10} itens.`;
    return summary;
}

async function scrape(limit = 50, foundLinks = [], newResults = []) {
    console.log(`🚀 OLX: Iniciando extração (Limite: ${limit})...`);

    const Listing = Parse.Object.extend("Listing");
    const query = new Parse.Query(Listing);
    query.equalTo("status", "ignored");
    const ignoredListings = await query.find(getOptions());
    const ignoredLinks = new Set(ignoredListings.map(l => l.get("link").split('?')[0]));

    console.log(`📡 OLX: Conectando via Browserless...`);
    const browser = await chromium.connectOverCDP(BROWSERLESS_WS);
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        bypassCSP: true
    });
    const page = await context.newPage();
    await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());

    const initialUrl = 'https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/alphaville?ps=1&pe=20000000&sp=6&f=p&o=1';
    const allData = [];

    try {
        console.log(`📡 OLX: Navegando para lista inicial...`);
        await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const title = await page.title();
        console.log(`📄 Título: ${title}`);

        if (title.includes("Access Denied") || title.includes("Cloudflare")) {
            console.error("🚫 Bloqueado pelo Cloudflare.");
            await updateScraperStatus("Erro: Bloqueio detectado (Cloudflare)", 0);
            return [];
        }

        const adUrlsResults = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const filtered = links
                .map(a => a.href)
                .filter(h => {
                    if (!h) return false;
                    const url = h.split('?')[0];
                    return url.includes('olx.com.br/') &&
                        url.includes('/imoveis/') &&
                        /\d{8,}/.test(url) &&
                        !url.includes('/venda/') &&
                        !url.includes('/aluguel/');
                })
                .map(h => h.split('?')[0]);
            return Array.from(new Set(filtered));
        });

        console.log(`🔍 Links Filtrados: ${adUrlsResults.length}`);
        const targetUrls = adUrlsResults.filter(link => !ignoredLinks.has(link)).slice(0, limit);
        console.log(`🎯 Processando ${targetUrls.length} links.`);

        let count = 0;
        for (const adUrl of targetUrls) {
            count++;
            const progress = Math.round((count / targetUrls.length) * 80) + 10;
            let retryCount = 0;
            const maxRetries = 2;
            let success = false;

            while (retryCount <= maxRetries && !success) {
                try {
                    await updateScraperStatus(`Extraindo ${count}/${targetUrls.length}`, progress, adUrl, foundLinks);
                    await page.goto(adUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
                    await page.waitForTimeout(1500);

                    const data = await page.evaluate(() => {
                        const priceEl = document.querySelector('h2[data-testid="ad-price"]') ||
                            document.querySelector('.price-value') ||
                            document.querySelector('span.price');
                        const bodyText = document.body.innerText;
                        const phoneMatch = bodyText.match(/(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-\s]?\d{4}/);
                        const sellerEl = document.querySelector('span[data-testid="ad-seller-name"]') ||
                            document.querySelector('div[data-testid="profile-card"] h2');
                        return {
                            price: priceEl ? priceEl.innerText.trim() : "N/A",
                            phone: phoneMatch ? phoneMatch[0].trim() : "Não informado",
                            contactName: sellerEl ? sellerEl.innerText.trim() : "Desconhecido"
                        };
                    });

                    console.log(`💎 Extraído: ${data.price} | Fone: ${data.phone}`);
                    const scrapedItem = { link: adUrl, valor: data.price, telefone: data.phone, contactName: data.contactName };
                    allData.push(scrapedItem);
                    foundLinks.push(adUrl);
                    const isNewEntry = await saveSingleListing(scrapedItem);
                    if (isNewEntry) newResults.push(scrapedItem);
                    await updateScraperStatus(`Encontrado: ${data.price}`, progress, adUrl, foundLinks);
                    success = true;
                } catch (e) {
                    retryCount++;
                    console.error(`⚠️ Erro na tentativa ${retryCount} para ${adUrl}: ${e.message}`);
                    if (retryCount > maxRetries) {
                        console.error(`❌ Desistindo de ${adUrl}`);
                    } else {
                        await page.waitForTimeout(3000);
                    }
                }
            }
            await page.waitForTimeout(2000);
        }
    } catch (err) {
        console.error("❌ Erro durante o scraping:", err.message);
    } finally {
        // Fecha apenas o contexto (abas, cookies), não o browser remoto
        // Isso evita derrubar a sessão do WhatsApp que usa o mesmo Browserless
        try { await context.close(); } catch (e) { console.log('Context close:', e.message); }
    }
    return allData;
}
