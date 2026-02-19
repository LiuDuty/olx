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

const path = require('path');

// Adiciona o plugin de stealth para evitar detecção de robôs
chromium.use(stealth);

// ==========================================
// CONFIGURAÇÃO
// ==========================================
const TELEFONE_DESTINO = process.env.TELEFONE_DESTINO || '5511975040117';
const PORT = process.env.PORT || 3000;

let lastQrCode = null;
let isScraping = false;

// Servidor Express
const app = express();
app.use(express.json());

// Função para atualizar o status em tempo real no Banco
async function updateScraperStatus(message, progress = 0, currentItem = null, links = []) {
    console.log(`📡 STATUS: ${message} (${progress}%)`);
    try {
        const ScraperStatus = Parse.Object.extend("ScraperStatus");
        const query = new Parse.Query(ScraperStatus);
        let status = await query.first({ useMasterKey: true });
        if (!status) status = new ScraperStatus();

        status.set("message", message);
        status.set("progress", progress);
        status.set("currentItem", currentItem);
        status.set("links", links); // Adiciona a lista de links encontrados
        status.set("lastUpdate", new Date());
        await status.save(null, { useMasterKey: true });
    } catch (e) {
        console.error("Erro ao atualizar status:", e.message);
    }
}

// Serve frontend build if exists
const frontendPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    // Catch-all route to serve index.html for SPA
    app.get('/', (req, res) => {
        res.sendFile(path.join(frontendPath, 'index.html'));
    });
}

app.get('/qr', (req, res) => {
    if (!lastQrCode) return res.send('<h1>Aguardando QR Code...</h1><p>Se o QR Code já foi escaneado, o sistema está pronto.</p>');

    QRCode.toDataURL(lastQrCode, (err, url) => {
        if (err) return res.status(500).send('Erro ao gerar imagem do QR Code');
        res.send(`
            <div style="text-align: center; font-family: sans-serif; padding: 50px;">
                <h1>Escaneie o WhatsApp</h1>
                <p>Abra o WhatsApp no celular e escaneie o código abaixo:</p>
                <img src="${url}" style="width: 300px; border: 10px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.1);" />
                <p style="color: gray; margin-top: 20px;">O robô enviará os resultados automaticamente quando a extração terminar.</p>
                <script>setTimeout(() => location.reload(), 10000);</script>
            </div>
        `);
    });
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
            const limitEnabledObj = await query.first({ useMasterKey: true });

            if (limitEnabledObj && limitEnabledObj.get("value") === "true") {
                const limitValObj = await new Parse.Query(Config).equalTo("key", "limit_value").first({ useMasterKey: true });
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
        let config = await query.first({ useMasterKey: true });

        if (!config) {
            config = new Config();
            config.set("key", key);
        }

        config.set("value", String(value));
        await config.save(null, { useMasterKey: true });

        res.json({ success: true, key, value });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint mantido por compatibilidade
app.post('/api/set-schedule', async (req, res) => {
    const { nextRun } = req.body;
    try {
        const Config = Parse.Object.extend("Config");
        const query = new Parse.Query(Config);
        query.equalTo("key", "next_run");
        let config = await query.first({ useMasterKey: true }) || new Config();
        config.set("key", "next_run");
        config.set("value", nextRun);
        await config.save(null, { useMasterKey: true });
        res.json({ message: 'Agendamento atualizado', nextRun });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        const results = await query.find({ useMasterKey: true });
        res.json(results.map(r => r.toJSON()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Proxy para buscar Status (Bypasse CLP error)
app.get('/api/status', async (req, res) => {
    try {
        const ScraperStatus = Parse.Object.extend("ScraperStatus");
        const query = new Parse.Query(ScraperStatus);
        const status = await query.first({ useMasterKey: true });
        if (status) {
            res.json(status.toJSON());
        } else {
            res.json({ message: 'Aguardando...', progress: 0 });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Proxy para atualizar Listagem
app.post('/api/update-listing', async (req, res) => {
    const { id, updates } = req.body;
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);
        const listing = await query.get(id, { useMasterKey: true });

        Object.entries(updates).forEach(([key, value]) => {
            listing.set(key, value);
        });

        await listing.save(null, { useMasterKey: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Proxy para limpar toda a base de imóveis
app.post('/api/clear-database', async (req, res) => {
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);
        query.limit(1000); // Processar em lotes se necessário
        const allListings = await query.find({ useMasterKey: true });

        const count = allListings.length;
        if (count > 0) {
            await Parse.Object.destroyAll(allListings, { useMasterKey: true });
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
        const configs = await query.find({ useMasterKey: true });
        const result = {};
        configs.forEach(c => {
            result[c.get("key")] = c.get("value");
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor Web ativo na porta ${PORT}`);
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
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote'
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

// Loop de Verificação de Agendamento (roda a cada minuto)
setInterval(async () => {
    if (isScraping) return;

    try {
        const Config = Parse.Object.extend("Config");
        const query = new Parse.Query(Config);
        const configs = await query.find({ useMasterKey: true });

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
                let scheduleConfig = await scheduleQuery.first({ useMasterKey: true });
                scheduleConfig.set("value", tomorrow07.toISO());
                await scheduleConfig.save(null, { useMasterKey: true });

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
            await newConfig.save(null, { useMasterKey: true });
            console.log(`🆕 Agendamento padrão criado para: ${defaultRun.toFormat('dd/MM HH:mm')}`);
        }
    } catch (err) {
        console.error("❌ Erro ao verificar agendamento:", err.message);
    }
}, 60000); // 1 minuto

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
        let listing = await query.first({ useMasterKey: true });

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

        await listing.save(null, { useMasterKey: true });
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
    const ignoredListings = await query.find({ useMasterKey: true });
    // Normalizar links já ignorados para comparação
    const ignoredLinks = new Set(ignoredListings.map(l => l.get("link").split('?')[0]));

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    const initialUrl = 'https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/alphaville?ps=1&pe=20000000&sp=6&f=p&o=1';

    const allData = [];
    try {
        await page.goto(initialUrl, { waitUntil: 'load', timeout: 90000 });

        const title = await page.title();
        console.log(`📄 Título da página: ${title}`);

        if (title.includes("Access Denied") || title.includes("Cloudflare")) {
            console.error("🚫 Bloqueado pelo Cloudflare/WAF da OLX.");
            await updateScraperStatus("Erro: Bloqueio detectado (Cloudflare)", 0);
            return [];
        }

        const adUrlsResults = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            // Captura e normaliza os links (remove query strings)
            const filtered = links
                .map(a => a.href)
                .filter(h => h && h.includes('olx.com.br/') && h.includes('/imoveis/') && !h.includes('/venda/') && !h.includes('/aluguel/'))
                .map(h => h.split('?')[0]);

            return Array.from(new Set(filtered));
        });

        console.log(`🔍 OLX Links Filtrados: ${adUrlsResults.length}`);
        const targetUrls = adUrlsResults.filter(link => !ignoredLinks.has(link)).slice(0, limit);
        console.log(`🎯 OLX: Processando ${targetUrls.length} links (após filtro e limite).`);

        let count = 0;
        for (const adUrl of targetUrls) {
            count++;
            const progress = Math.round((count / targetUrls.length) * 80) + 10;
            const detailPage = await context.newPage();
            try {
                await updateScraperStatus(`Extraindo anúncio ${count}/${targetUrls.length}`, progress, adUrl, foundLinks);
                await detailPage.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
                await detailPage.goto(adUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });

                const price = await detailPage.evaluate(() => {
                    const el = document.querySelector('span[data-testid="ad-price"]') ||
                        document.querySelector('h2.ad-price') ||
                        Array.from(document.querySelectorAll('h2')).find(h => h.innerText.includes('R$'));
                    return el ? el.innerText.trim() : "N/A";
                });

                const phone = await detailPage.evaluate(() => {
                    const text = document.body.innerText;
                    const match = text.match(/(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-\s]?\d{4}/);
                    return match ? match[0].trim() : "Não informado";
                });

                const contactName = await detailPage.evaluate(() => {
                    const el = document.querySelector('span[data-testid="ad-seller-name"]') ||
                        document.querySelector('div[data-testid="profile-card"] h2') ||
                        document.querySelector('.ad-seller-name');
                    return el ? el.innerText.trim() : "Desconhecido";
                });

                console.log(`💎 Extraído: ${price} | Fone: ${phone} | Nome: ${contactName}`);

                const scrapedItem = { link: adUrl, valor: price, telefone: phone, contactName: contactName };
                allData.push(scrapedItem);
                foundLinks.push(adUrl); // Adiciona à lista de monitoramento

                // Salva imediatamente no banco de dados e verifica se é novo!
                const isNewEntry = await saveSingleListing(scrapedItem);
                if (isNewEntry) {
                    newResults.push(scrapedItem);
                }

                // Atualiza status com a lista de links atualizada
                await updateScraperStatus(`Encontrado: ${price}`, progress, adUrl, foundLinks);

            } catch (e) {
                console.error(`❌ Falha ao extrair ${adUrl}: ${e.message}`);
            } finally { await detailPage.close(); }
            await page.waitForTimeout(1000);
        }
    } catch (err) {
        console.error("❌ Erro durante o scraping:", err.message);
    } finally {
        await browser.close();
    }
    return allData;
}
