const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const cron = require('node-cron');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const Parse = require('./db');
const { DateTime } = require('luxon');
const https = require('https');
const http = require('http');

const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');

// Helper para usar Master Key apenas se ela estiver configurada, evitando erro 500
const getOptions = () => Parse.hasMasterKey ? { useMasterKey: true } : {};

// Adiciona o plugin de stealth para evitar detecção de robôs
chromium.use(stealth);

// ==========================================
// CONFIGURAÇÃO
// ==========================================
const TELEFONE_DESTINO = process.env.TELEFONE_DESTINO || '5511975040117';
const PORT = process.env.PORT || 7860;

let lastQrCode = null;
let isScraping = false;
let whatsappStatus = 'Iniciando...';

// Servidor Express
const app = express();
// 1. MIDDLEWARES
app.use(cors());
app.use(express.json());

// Log de requisições detalhado
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// 2. ROTAS DA API (Sempre no topo)

// Check de Saúde e Online
app.get('/', (req, res) => res.send('🚀 OLX Backend API is Online! Use Vercel for Frontend.'));

app.get('/api/health', (req, res) => res.json({
    status: 'API Online',
    serverTime: new Date(),
    whatsapp: whatsappStatus
}));

// Status do WhatsApp e QR Code
app.get('/api/whatsapp-status', (req, res) => {
    res.json({ status: whatsappStatus, hasQr: !!lastQrCode });
});

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

// Rotas de Configuração
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
    try {
        const Config = Parse.Object.extend("Config");
        const query = new Parse.Query(Config);
        query.equalTo("key", key);
        let config = await query.first(getOptions()) || new Config();
        config.set("key", key);
        config.set("value", String(value));
        await config.save(null, getOptions());
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listagens e Operações
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

app.post('/api/run-now', async (req, res) => {
    if (isScraping) return res.status(400).json({ error: 'Scraper já está rodando' });
    const limit = req.body.limit || 50;
    ejetaScraper(limit);
    res.json({ message: `Iniciado com limite de ${limit}` });
});

// WhatsApp Page (Para o QR Code inicial ser visível se necessário)
app.get('/qr', (req, res) => {
    if (!lastQrCode) return res.send(`<h2>Status: ${whatsappStatus}</h2><p>Aguardando QR Code...</p><script>setTimeout(()=>location.reload(), 5000)</script>`);
    QRCode.toDataURL(lastQrCode, (err, url) => {
        res.send(`<div style="text-align:center"><h1>Escaneie o WhatsApp</h1><img src="${url}" /><p>${whatsappStatus}</p></div><script>setTimeout(()=>location.reload(), 10000)</script>`);
    });
});

// Resto das rotas (reset, update, etc)...
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
        const results = await query.find(getOptions());
        if (results.length > 0) await Parse.Object.destroyAll(results, getOptions());
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/whatsapp-reset', async (req, res) => {
    try {
        await client.destroy();
        const authPath = path.join(__dirname, '.wwebjs_auth');
        if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
        res.json({ success: true });
        setTimeout(() => process.exit(0), 1000);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para disparar o scraper manualmente
app.post('/api/run-now', async (req, res) => {
    console.log("🖱️ Comando disparar scraper recebido!");
    if (isScraping) return res.status(400).json({ error: 'Scraper já está rodando' });

    let limit = req.body.limit;
    // Se não veio no body, tenta pegar do banco
    if (limit === undefined) {
        try {
            const Config = Parse.Object.extend("Config");
            const query = new Parse.Query(Config);
            query.equalTo("key", "limit_enabled");
            const limitEnabledObj = await query.first(getOptions());

            if (limitEnabledObj && limitEnabledObj.get("value") === "true") {
                const limitValObj = await new Parse.Query(Config).equalTo("key", "limit_value").first(getOptions());
                limit = limitValObj ? parseInt(limitValObj.get("value")) : 50;
            } else {
                limit = 999; // Sem limite prático
            }
        } catch (e) {
            limit = 50;
        }
    }

    console.log(`🚀 Iniciando execução manual com limite: ${limit}`);
    ejetaScraper(limit);
    res.json({ message: `Scraper iniciado com limite de ${limit} itens` });
});

// Endpoint para atualizar configurações genéricas
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
        console.error("❌ ERROR API:", err);
        res.status(500).json({
            error: err.message,
            details: "Verifique os logs do servidor para mais detalhes.",
            code: err.code
        });
    }
});

// Endpoint mantido por compatibilidade
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
        console.error("❌ ERROR API:", err);
        res.status(500).json({
            error: err.message,
            details: "Verifique os logs do servidor para mais detalhes.",
            code: err.code
        });
    }
});

// Proxy para buscar Listagens (Bypasse CLP error)
app.get('/api/listings', async (req, res) => {
    const { filter } = req.query;
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);

        if (filter === 'favorites') {
            query.equalTo("isFavorite", true);
        } else if (filter === 'ignored') {
            query.equalTo("status", "ignored");
        } else {
            query.equalTo("status", "active");
        }

        // Ordena pelos mais recentes capturados primeiro
        query.descending("capturedAt");
        const results = await query.find(getOptions());
        res.json(results.map(r => r.toJSON()));
    } catch (err) {
        console.error("❌ ERROR API:", err);
        res.status(500).json({
            error: err.message,
            details: "Verifique os logs do servidor para mais detalhes.",
            code: err.code
        });
    }
});

// Proxy para buscar Status (Bypasse CLP error)
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
        console.error("❌ ERROR API:", err);
        res.status(500).json({
            error: err.message,
            details: "Verifique os logs do servidor para mais detalhes.",
            code: err.code
        });
    }
});

// Proxy para atualizar Listagem
app.post('/api/update-listing', async (req, res) => {
    const { id, updates } = req.body;
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);
        const listing = await query.get(id, getOptions());

        Object.entries(updates).forEach(([key, value]) => {
            listing.set(key, value);
        });

        await listing.save(null, getOptions());
        res.json({ success: true });
    } catch (err) {
        console.error("❌ ERROR API:", err);
        res.status(500).json({
            error: err.message,
            details: "Verifique os logs do servidor para mais detalhes.",
            code: err.code
        });
    }
});

// Proxy para limpar toda a base de imóveis
app.post('/api/clear-database', async (req, res) => {
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);
        query.limit(1000); // Processar em lotes se necessário
        const allListings = await query.find(getOptions());

        const count = allListings.length;
        if (count > 0) {
            await Parse.Object.destroyAll(allListings, getOptions());
        }

        console.log(`🧹 BASE LIMPA: ${count} registros removidos.`);
        res.json({ success: true, count });
    } catch (err) {
        console.error("❌ Erro ao limpar base:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Proxy para buscar todas as Configs relevantes
app.get('/api/config', async (req, res) => {
    try {
        const Config = Parse.Object.extend("Config");
        const query = new Parse.Query(Config);
        const configs = await query.find(getOptions());
        const result = {};
        configs.forEach(c => {
            result[c.get("key")] = c.get("value");
        });
        res.json(result);
    } catch (err) {
        console.error("❌ Erro na operação API:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor Web ativo na porta ${PORT}`);

    // Inicia o auto-ping para evitar que o container durma
    const APP_URL = process.env.APP_URL || 'https://olx-12ntim1b.b4a.run';
    setInterval(() => {
        console.log(`📡 [Keep-Alive] Pinging ${APP_URL}...`);
        const protocol = APP_URL.startsWith('https') ? https : http;
        protocol.get(APP_URL, (res) => {
            console.log(`✅ [Keep-Alive] Status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error(`❌ [Keep-Alive] Erro: ${err.message}`);
        });
    }, 10 * 60 * 1000); // A cada 10 minutos
});

// Inicialização do WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth_hf'
    }),
    puppeteer: {
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === 'win32' ? null : '/usr/bin/chromium'),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process',
            '--disable-extensions',
            '--disable-software-rasterizer',
            '--js-flags="--max-old-space-size=400"'
        ],
        protocolTimeout: 600000
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1012170943-alpha.html'
    }
});

client.on('qr', (qr) => {
    lastQrCode = qr;
    whatsappStatus = 'Aguardando Escaneamento (QR Code Gerado)';
    console.log('📱 WHATSAPP: Novo QR Code gerado.');
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
    // Tenta re-inicializar
    setTimeout(() => {
        console.log('🔄 Tentando re-inicializar WhatsApp...');
        client.initialize();
    }, 5000);
});

// Função para inicializar o WhatsApp com segurança contra erros de rede (DNS) e conflitos de porta
async function startWhatsApp() {
    console.log("🟢 [WhatsApp] Iniciando tentativa de conexão...");

    // Captura erros globais temporariamente
    const errorHandler = (err) => {
        if (err.message.includes('ERR_NAME_NOT_RESOLVED') || err.message.includes('Target closed')) {
            console.error("⚠️ [WhatsApp] Erro de rede/DNS detectado durante boot inicial.");
            whatsappStatus = 'Erro de Rede';
        } else if (err.message.includes('already running')) {
            console.error("⚠️ [WhatsApp] Conflito de processo detectado.");
            whatsappStatus = 'Reiniciando Navegador...';
        } else {
            console.error("❌ [WhatsApp] Erro:", err.message);
        }
    };

    process.once('unhandledRejection', errorHandler);
    process.once('uncaughtException', errorHandler);

    try {
        await client.initialize();
        console.log("✅ [WhatsApp] Inicialização concluída");
    } catch (err) {
        console.error("❌ [WhatsApp] Falha:", err.message);
        whatsappStatus = 'Erro ao carregar';
        console.log("♻️ [WhatsApp] Nova tentativa em 45 segundos...");
        setTimeout(startWhatsApp, 45000);
    } finally {
        setTimeout(() => {
            process.removeListener('unhandledRejection', errorHandler);
            process.removeListener('uncaughtException', errorHandler);
        }, 5000);
    }
}

startWhatsApp();


// Loop de Verificação de Agendamento (roda a cada minuto)
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
                console.log(`⏰ [${now.toFormat('dd/MM/yyyy HH:mm:ss')}] Iniciando execução agendada...`);

                // Agenda para o próximo dia às 07:00
                const tomorrow07 = now.plus({ days: 1 }).set({ hour: 7, minute: 0, second: 0, millisecond: 0 });

                // Salva o novo agendamento
                const scheduleQuery = new Parse.Query(Config).equalTo("key", "next_run");
                let scheduleConfig = await scheduleQuery.first(getOptions());
                scheduleConfig.set("value", tomorrow07.toISO());
                await scheduleConfig.save(null, getOptions());

                // Determina o limite baseado na config
                let runLimit = 999;
                if (configMap["limit_enabled"] === "true") {
                    runLimit = parseInt(configMap["limit_value"]) || 50;
                }

                ejetaScraper(runLimit);
            }
        } else {
            // Se não existir, cria o agendamento padrão para as 07:00
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
}, 60000); // 1 minuto

// Função para atualizar o status em tempo real no Banco
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
        console.log(`📊 Extração finalizada. Total capturado: ${results ? results.length : 0} itens. Novos: ${newResults.length}`);

        if (newResults.length > 0) {
            await updateScraperStatus(`Processo finalizado! ${newResults.length} novos registros.`, 100, null, foundLinks);
            await sendWhatsApp(newResults);
        } else if (results && results.length > 0) {
            await updateScraperStatus("Finalizado. Nenhum registro novo para WhatsApp.", 100, null, foundLinks);
        } else {
            await updateScraperStatus("Nenhum registro NOVO encontrado.", 100, null, foundLinks);
        }
    } catch (err) {
        console.error("💥 Erro no processo completo:", err);
        await updateScraperStatus(`Erro: ${err.message}`, 0);
    } finally {
        isScraping = false;
        setTimeout(() => updateScraperStatus("Aguardando próximo ciclo...", 0), 10000);
    }
}

// Função para formatar telefone e gerar link do WhatsApp
function generateWhatsAppLink(phone) {
    if (!phone || phone === "Não informado") return null;
    // Remove tudo que não é dígito
    const digits = phone.replace(/\D/g, '');
    // Se não tem DDI, assume 55
    const fullNumber = digits.length <= 11 ? '55' + digits : digits;
    const message = encodeURIComponent("Olá! Vi seu anúncio e quero saber mais");
    return `https://wa.me/${fullNumber}?text=${message}`;
}

async function saveSingleListing(item) {
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);
        // O link normalizado é nossa chave única
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
            listing.set("capturedAt", new Date()); // Data exata da captura original
        }

        await listing.save(null, getOptions());
        console.log(`✅ ${isNew ? 'NOVO' : 'ATUALIZADO'} no banco: ${item.valor} | ${item.link}`);
        return isNew;
    } catch (e) {
        console.error(`❌ Erro ao salvar registro individual:`, e.message);
        return false;
    }
}

async function updateDatabase(data) {
    return;
}

async function sendWhatsApp(data) {
    try {
        const content = generateSummary(data);
        const chat = await client.getChatById(`${TELEFONE_DESTINO}@c.us`);
        await chat.sendMessage(`🚀 Extração Finalizada!\n\n${content}\n\nConfira todos os detalhes no Web App. `);
        console.log("🚀 WHATSAPP: Resumo enviado!");
    } catch (err) {
        console.error("❌ WHATSAPP Error:", err.message);
    }
}

function generateSummary(data) {
    let summary = "";
    data.slice(0, 10).forEach((item, i) => {
        const waLink = generateWhatsAppLink(item.telefone);
        summary += `${i + 1}. 💰 ${item.valor}\n👤 ${item.contactName || 'N/A'}\n📞 ${item.telefone}\n🔗 ${item.link}\n💬 WhatsApp: ${waLink || 'N/A'}\n\n`;
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
    // Normalizar links já ignorados para comparação
    const ignoredLinks = new Set(ignoredListings.map(l => l.get("link").split('?')[0]));

    const browser = await chromium.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (process.platform === 'win32' ? null : '/usr/bin/chromium'),
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--single-process',
            '--js-flags="--max-old-space-size=400"'
        ]
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        bypassCSP: true
    });
    const page = await context.newPage();
    // Bloqueia recursos pesados na página inicial para economizar RAM
    await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());

    const initialUrl = 'https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/alphaville?ps=1&pe=20000000&sp=6&f=p&o=1';

    const allData = [];
    try {
        console.log(`📡 OLX: Navegando para lista inicial...`);
        await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const title = await page.title();
        console.log(`📄 Título da página: ${title}`);

        if (title.includes("Access Denied") || title.includes("Cloudflare")) {
            console.error("🚫 Bloqueado pelo Cloudflare/WAF da OLX.");
            await updateScraperStatus("Erro: Bloqueio detectado (Cloudflare)", 0);
            return [];
        }

        const adUrlsResults = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            // Captura links que parecem ser de anúncios reais (geralmente terminam com um ID numérico longo)
            const filtered = links
                .map(a => a.href)
                .filter(h => {
                    if (!h) return false;
                    const url = h.split('?')[0];
                    // Deve ser da OLX, de imóveis, e ter um padrão de ID (números no final)
                    return url.includes('olx.com.br/') &&
                        url.includes('/imoveis/') &&
                        /\d{8,}/.test(url) && // Pelo menos 8 dígitos seguidos (o ID)
                        !url.includes('/venda/') &&
                        !url.includes('/aluguel/');
                })
                .map(h => h.split('?')[0]);

            return Array.from(new Set(filtered));
        });

        console.log(`🔍 OLX Links Filtrados: ${adUrlsResults.length}`);
        const targetUrls = adUrlsResults.filter(link => !ignoredLinks.has(link)).slice(0, limit);
        console.log(`🎯 OLX: Processando ${targetUrls.length} links.`);

        // REUSO DE PÁGINA: Vamos usar a mesma página para economizar RAM no servidor
        let count = 0;
        for (const adUrl of targetUrls) {
            count++;
            const progress = Math.round((count / targetUrls.length) * 80) + 10;

            // Lógica de Retentativa para cada anúncio
            let retryCount = 0;
            const maxRetries = 2;
            let success = false;

            while (retryCount <= maxRetries && !success) {
                try {
                    await updateScraperStatus(`Extraindo anúncio ${count}/${targetUrls.length}${retryCount > 0 ? ` (Tentativa ${retryCount + 1})` : ''}`, progress, adUrl, foundLinks);

                    // Navega na mesma página
                    await page.goto(adUrl, { waitUntil: 'domcontentloaded', timeout: 50000 });

                    const detailTitle = await page.title();
                    if (detailTitle.includes("Access Denied") || detailTitle.includes("Cloudflare")) {
                        console.error(`🚫 Bloqueio detectado em: ${adUrl}`);
                        break; // Se for bloqueio, não adianta tentar de novo
                    }

                    const data = await page.evaluate(() => {
                        const priceEl = document.querySelector('span[data-testid="ad-price"]') ||
                            document.querySelector('h2.ad-price') ||
                            Array.from(document.querySelectorAll('h2')).find(h => h.innerText.includes('R$'));

                        const phoneMatch = document.body.innerText.match(/(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-\s]?\d{4}/);

                        const sellerEl = document.querySelector('span[data-testid="ad-seller-name"]') ||
                            document.querySelector('div[data-testid="profile-card"] h2') ||
                            document.querySelector('.ad-seller-name');

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
                    if (isNewEntry) {
                        newResults.push(scrapedItem);
                    }

                    await updateScraperStatus(`Encontrado: ${data.price}`, progress, adUrl, foundLinks);
                    success = true;

                } catch (e) {
                    retryCount++;
                    console.error(`⚠️ Erro na tentativa ${retryCount} para ${adUrl}: ${e.message}`);
                    if (retryCount > maxRetries) {
                        console.error(`❌ Desistindo de ${adUrl} após ${maxRetries} tentativas.`);
                    } else {
                        await page.waitForTimeout(3000); // Espera um pouco antes de tentar de novo
                    }
                }
            }
            await page.waitForTimeout(2000); // Pausa entre anúncios
        }
    } catch (err) {
        console.error("❌ Erro durante o scraping:", err.message);
    } finally {
        await browser.close();
    }
    return allData;
}
