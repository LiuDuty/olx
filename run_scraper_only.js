
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const Parse = require('./db');
const { DateTime } = require('luxon');

// Adiciona o plugin de stealth
chromium.use(stealth);

async function updateScraperStatus(message, progress = 0, currentItem = null, links = []) {
    console.log(`📡 STATUS: ${message} (${progress}%)`);
    try {
        const ScraperStatus = Parse.Object.extend("ScraperStatus");
        const query = new Parse.Query(ScraperStatus);
        const options = Parse.hasMasterKey ? { useMasterKey: true } : {};
        let status = await query.first(options);
        if (!status) status = new ScraperStatus();

        status.set("message", message);
        status.set("progress", progress);
        status.set("currentItem", currentItem);
        status.set("links", links);
        status.set("lastUpdate", new Date());
        await status.save(null, options);
    } catch (e) {
        console.error("Erro ao atualizar status:", e.message);
    }
}

async function saveSingleListing(item) {
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);
        const options = Parse.hasMasterKey ? { useMasterKey: true } : {};
        query.equalTo("link", item.link);
        let listing = await query.first(options);

        const isNew = !listing;
        if (!listing) {
            listing = new Listing();
            listing.set("link", item.link);
        } else if (listing.get("status") === "ignored") {
            return false;
        }

        listing.set("price", item.valor);
        listing.set("phone", item.telefone);
        listing.set("contactName", item.contactName || "Desconhecido");
        listing.set("lastUpdated", new Date());

        if (isNew) {
            listing.set("status", "active");
            listing.set("isFavorite", false);
            listing.set("capturedAt", new Date());
        }

        await listing.save(null, options);
        console.log(`✅ ${isNew ? 'NOVO' : 'ATUALIZADO'} no banco: ${item.valor} | ${item.link}`);
        return isNew;
    } catch (e) {
        console.error(`❌ Erro ao salvar registro:`, e.message);
        return false;
    }
}

async function scrape(limit = 10) {
    console.log(`🚀 OLX: Iniciando extração LOCAL (Limite: ${limit})...`);
    const foundLinks = [];
    const newResults = [];

    const browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox']
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        bypassCSP: true
    });

    const page = await context.newPage();
    const initialUrl = 'https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/alphaville?ps=1&pe=20000000&sp=6&f=p&o=1';

    try {
        await updateScraperStatus("Iniciando extração local...", 5, null, foundLinks);
        await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const title = await page.title();
        console.log(`📄 Título da página: ${title}`);

        if (title.includes("Access Denied") || title.includes("Cloudflare")) {
            console.error("🚫 Bloqueado pelo Cloudflare.");
            await updateScraperStatus("Erro: Bloqueio detectado", 0);
            return;
        }

        const adUrlsResults = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const filtered = links
                .map(a => a.href)
                .filter(h => h && h.includes('olx.com.br/') && h.includes('/imoveis/') && !h.includes('/venda/') && !h.includes('/aluguel/'))
                .map(h => h.split('?')[0]);
            return Array.from(new Set(filtered));
        });

        const targetUrls = adUrlsResults.slice(0, limit);
        console.log(`🎯 Processando ${targetUrls.length} links.`);

        let count = 0;
        for (const adUrl of targetUrls) {
            count++;
            const progress = Math.round((count / targetUrls.length) * 80) + 10;
            const detailPage = await context.newPage();
            try {
                await updateScraperStatus(`Extraindo anúncio ${count}/${targetUrls.length}`, progress, adUrl, foundLinks);
                await detailPage.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
                await detailPage.goto(adUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                const detailTitle = await detailPage.title();
                if (detailTitle.includes("Access Denied") || detailTitle.includes("Cloudflare")) {
                    console.error(`🚫 Bloqueio em: ${adUrl}`);
                    continue;
                }

                const data = await detailPage.evaluate(() => {
                    const priceEl = document.querySelector('span[data-testid="ad-price"]') || document.querySelector('h2.ad-price');
                    const sellerEl = document.querySelector('span[data-testid="ad-seller-name"]') || document.querySelector('.ad-seller-name');
                    const text = document.body.innerText;
                    const phoneMatch = text.match(/(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-\s]?\d{4}/);

                    return {
                        valor: priceEl ? priceEl.innerText.trim() : "N/A",
                        telefone: phoneMatch ? phoneMatch[0].trim() : "Não informado",
                        contactName: sellerEl ? sellerEl.innerText.trim() : "Desconhecido"
                    };
                });

                const scrapedItem = { link: adUrl, ...data };
                console.log(`💎 Extraído: ${data.valor} | Fone: ${data.telefone}`);

                foundLinks.push(adUrl);
                const isNew = await saveSingleListing(scrapedItem);
                if (isNew) newResults.push(scrapedItem);

                await updateScraperStatus(`Encontrado: ${data.valor}`, progress, adUrl, foundLinks);
            } catch (e) {
                console.error(`❌ Falha em ${adUrl}: ${e.message}`);
            } finally {
                await detailPage.close();
            }
        }
        await updateScraperStatus("Finalizado!", 100, null, foundLinks);
    } catch (err) {
        console.error("❌ Erro:", err.message);
    } finally {
        await browser.close();
        console.log("🏁 Processo finalizado.");
        process.exit(0);
    }
}

const argLimit = process.argv[2] ? parseInt(process.argv[2]) : 10;
scrape(argLimit);
