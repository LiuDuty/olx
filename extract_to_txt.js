/**
 * OLX Scraper - Alphaville | Tamboré | Barueri | Venda + Aluguel | Particular
 * Estratégia: lê o telefone da metatag og:description
 * Salva SOMENTE os anúncios onde o telefone foi obtido com sucesso.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ====================================
// CONFIG — ajuste aqui as buscas
// ====================================
const FILTERS = {
    regions: ['alphaville', 'tambore', 'barueri'],
    types: ['venda', 'aluguel'],
    priceMin: 1000000,
    priceMax: 50000000,
};
const RESULT_FILE = path.join(__dirname, 'resultado_com_telefone.txt');
const MAX_PAGES = 5;  // páginas por combinação (aumente para varredura completa)

// ====================================
// HELPERS
// ====================================
function log(msg) {
    const ts = new Date().toLocaleTimeString('pt-BR');
    console.log(`[${ts}] ${msg}`);
}

function saveRecord(record, count) {
    const sep = '-'.repeat(55);

    // Limpeza final do nome
    let rawName = record.contactName || "Desconhecido";
    let cleanName = rawName.replace(/Particular\s*\(?/i, '').replace(/\)?$/, '').trim();

    const entry = [
        ``,
        `#${count}  ${record.title}`,
        `REGIÃO:    ${record.region ? record.region.toUpperCase() : '-'} | ${record.tipo ? record.tipo.toUpperCase() : '-'}`,
        `PREÇO:     ${record.price}`,
        `TELEFONE:  ${record.phone}`,
        `CONTATO:   ${cleanName || 'Desconhecido'}`,
        `LINK:      ${record.link}`,
        sep,
    ].join('\n');
    fs.appendFileSync(RESULT_FILE, entry + '\n', 'utf8');
}

// Extrai telefone de qualquer texto
function findPhone(text) {
    const patterns = [
        /\(\s*\d{2}\s*\)\s*9?\s*\d{4}[-.\s]?\d{4}/,
        /\d{2}\s*9\d{4}[-\s]\d{4}/,
        /\d{2}9\d{8}/,
        /\d{2}\s\d{4}[-\s]\d{4}/,
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m) {
            const digits = m[0].replace(/\D/g, '');
            if (digits.length >= 10 && digits.length <= 11) return m[0].trim();
        }
    }
    return null;
}

// ====================================
// EXTRAI DADOS + TELEFONE VIA og:description
// ====================================
async function extractWithPhone(page, link) {
    try {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(1500);

        const adId = link.match(/-(\d{8,})$/)?.[1];

        const data = await page.evaluate((currentAdId) => {
            const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
            const bodyText = document.body.innerText;

            // Despreza se tiver a palavra CRECI (indica corretor/imobiliária)
            if (ogDesc.toUpperCase().includes('CRECI') || bodyText.toUpperCase().includes('CRECI')) {
                return { ignoreAsBroker: true };
            }

            const phoneRegex = /\(?\d{2}\)?\s*(?:9\s?\d{4}|[2-9]\d{3})[-\s]?\d{4}/g;
            const isValidPhone = (s) => {
                const digits = s.replace(/\D/g, '');
                // Deve ter 10+ dígitos E não ser o ID do anúncio
                return digits.length >= 10 && digits !== currentAdId;
            };

            const ogPhones = (ogDesc.match(phoneRegex) || []).filter(isValidPhone);
            const bodyPhones = (bodyText.match(phoneRegex) || []).filter(isValidPhone);
            const allPhones = [...ogPhones, ...bodyPhones];
            const bestPhone = allPhones.length > 0
                ? allPhones.sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length)[0].trim()
                : null;

            let contactName = null;
            const nameMatch = ogDesc.match(/\(([^)]{2,30})\)\s*$/);
            if (nameMatch) {
                contactName = nameMatch[1].trim();
            } else {
                const tratarMatch = ogDesc.match(/(?:Tratar com|Falar com|Contato)\s+(?:o\s+|a\s+)?([A-ZÀ-Ú][a-zà-ú]{2,}(?:\s+[A-ZÀ-Ú][a-zà-ú]{2,})?)/);
                if (tratarMatch) contactName = tratarMatch[1].trim();
            }

            const sellerEl = document.querySelector('span.typo-body-large.ad__sc-ypp2u2-4') ||
                document.querySelector('span[data-testid="ad-seller-name"]') ||
                document.querySelector('div[data-testid="profile-card"] h2');

            const priceEl = document.querySelector('span.typo-display-large') ||
                document.querySelector('#price-box-container span.typo-title-medium') ||
                document.querySelector('h2[data-testid="ad-price"]') ||
                document.querySelector('.price-value') ||
                document.querySelector('span.price') ||
                document.querySelector('div[data-testid="ad-price"]');

            let price = priceEl ? priceEl.innerText.trim() : 'N/A';
            if (price === 'N/A' || price === 'R$ 0') {
                const pm = ogDesc.match(/R\$\s*([\d.]+)/);
                if (pm) price = `R$ ${pm[1]}`;
            }

            const ogTitle = document.querySelector('meta[property="og:title"]')?.content?.split('|')[0].trim();
            const titleEl = document.querySelector('h1.typo-title-medium') || document.querySelector('h1[data-testid="ad-title"]') || document.querySelector('h1');

            return {
                title: ogTitle || (titleEl ? titleEl.innerText.trim() : 'Sem título'),
                price: (price === 'N/A' || price.includes('Sob consulta')) ? 'N/A' : price,
                phone: bestPhone,
                contactName: contactName || (sellerEl ? sellerEl.innerText.trim() : null)
            };
        }, adId);

        if (data.phone) {
            log(`     📞 Tel (og:desc): ${data.phone} | Contato: ${data.contactName}`);
        } else {
            log(`     ⚪ Nenhum telefone encontrado`);
        }

        return { ...data, link };

    } catch (err) {
        log(`     ❌ Erro ao extrair ${link}: ${err.message.substring(0, 80)}`);
        return { link, title: 'Erro', price: 'N/A', phone: null, contactName: null };
    }
}

// ====================================
// MAIN
// ====================================
async function main() {
    // Monta combinações região × tipo
    const combos = [];
    for (const region of FILTERS.regions) {
        for (const tipo of FILTERS.types) {
            let baseUrl;
            if (tipo === 'venda') {
                baseUrl = `https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/${region}?ps=${FILTERS.priceMin}&pe=${FILTERS.priceMax}&sp=6&f=p&o=`;
            } else {
                baseUrl = `https://www.olx.com.br/imoveis/aluguel/estado-sp/sao-paulo-e-regiao/${region}?sp=6&f=p&o=`;
            }
            combos.push({ region, tipo, baseUrl });
        }
    }

    // Cabeçalho do arquivo
    if (fs.existsSync(RESULT_FILE)) fs.unlinkSync(RESULT_FILE);
    const regioesTxt = FILTERS.regions.join(', ');
    const tiposTxt = FILTERS.types.join(', ');
    fs.writeFileSync(RESULT_FILE,
        `OLX - ${regioesTxt} | ${tiposTxt} | Particular | R$${FILTERS.priceMin / 1e6}M–R$${FILTERS.priceMax / 1e6}M\n` +
        `Gerado em: ${new Date().toLocaleString('pt-BR')}\n` +
        `Somente anúncios com telefone encontrado.\n` +
        '='.repeat(55) + '\n', 'utf8');

    log(`🚀 Iniciando scraper | ${combos.length} combinações (${regioesTxt}) × (${tiposTxt})`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    const seen = new Set();
    let totalSaved = 0;
    let totalChecked = 0;

    // ── Itera cada combinação ───────────────────────────────────────
    for (const combo of combos) {
        log(`\n━━━ [${combo.region.toUpperCase()} | ${combo.tipo.toUpperCase()}] ━━━`);
        let pageNum = 1;
        let hasMore = true;

        while (hasMore && pageNum <= MAX_PAGES) {
            const listUrl = combo.baseUrl + pageNum;
            log(`  📄 Página ${pageNum} | Salvos: ${totalSaved} | Verificados: ${totalChecked}`);

            try {
                await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await page.waitForTimeout(2000);

                const { links, hasNextPage } = await page.evaluate(() => {
                    const anchors = Array.from(document.querySelectorAll('a.olx-adcard__link'));
                    const links = anchors.length > 0
                        ? [...new Set(anchors.map(a => a.href.split('?')[0]))]
                        : [...new Set(
                            Array.from(document.querySelectorAll('a[href*="/imoveis/"]'))
                                .map(a => a.href.split('?')[0])
                                .filter(h => /\d{7,}/.test(h))
                        )];
                    const nextBtn = document.querySelector('a[aria-label="Próxima página"], a[data-lurker-detail="next_page"], [aria-label="Next page"]');
                    return { links, hasNextPage: !!nextBtn };
                });

                hasMore = hasNextPage;
                log(`  🔗 ${links.length} anúncios | Próxima página: ${hasMore}`);

                if (links.length === 0) { log('  ⛔ Sem links.'); break; }

                for (const link of links) {
                    if (seen.has(link)) continue;
                    seen.add(link);
                    totalChecked++;

                    log(`    🔹 [${totalChecked}v/${totalSaved}s | ${combo.region}/${combo.tipo}] ${link.split('/').pop().substring(0, 50)}`);

                    try {
                        const data = await extractWithPhone(page, link);

                        if (data.ignoreAsBroker) {
                            log(`    🚫 Descartado (CRECI): ${link.split('/').pop()}`);
                            continue;
                        }

                        if (data.phone) {
                            totalSaved++;
                            saveRecord({ ...data, region: combo.region, tipo: combo.tipo }, totalSaved);
                            log(`    ✅ #${totalSaved} | ${data.price} | ${data.phone} | ${data.contactName || ''} | ${combo.region}`);
                        } else {
                            log(`    ⚪ Sem telefone — descartado`);
                        }
                    } catch (err) {
                        log(`    ❌ Erro: ${err.message.substring(0, 70)}`);
                    }
                }

            } catch (err) {
                log(`  ❌ Erro na página ${pageNum}: ${err.message.substring(0, 80)}`);
                hasMore = false;
            }

            pageNum++;
        }
    } // fim combos

    await browser.close();

    const footer = `\n${'='.repeat(55)}\nTOTAL VERIFICADOS: ${totalChecked}\nTOTAL COM TELEFONE: ${totalSaved}\n`;
    fs.appendFileSync(RESULT_FILE, footer, 'utf8');

    log(`\n🎉 Concluído! ${totalSaved} registros com telefone de ${totalChecked} verificados.`);
    log(`📁 ${RESULT_FILE}`);
}

main().catch(console.error);
