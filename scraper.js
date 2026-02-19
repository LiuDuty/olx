const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const cron = require('node-cron');

// Adiciona o plugin de stealth para evitar detecção de robôs
chromium.use(stealth);

// ==========================================
// CONFIGURAÇÃO DO AGENDAMENTO
// ==========================================
// Horário definitivo: 09:05
const AGENDAMENTO = '5 9 * * *';

console.log(`🕒 Agendador iniciado! O processo rodará as ${AGENDAMENTO.split(' ')[1]}:${AGENDAMENTO.split(' ')[0].padStart(2, '0')}.`);

// EXECUÇÃO IMEDIATA PARA TESTE
scrape().then(() => {
    console.log(`\n✅ TESTE IMEDIATO CONCLUÍDO!`);
    console.log(`🚀 O agendador continuará ativo para o horário de ${AGENDAMENTO.split(' ')[1]}:${AGENDAMENTO.split(' ')[0].padStart(2, '0')}.`);
}).catch(err => console.error("💥 Erro no teste:", err));

// Inicia o agendamento
cron.schedule(AGENDAMENTO, () => {
    const agora = new Date().toLocaleString();
    console.log(`\n⏰ [${agora}] Iniciando execução agendada...`);

    // Limpar o arquivo de resultados antes de começar para garantir que o que vermos é novo
    if (fs.existsSync('resultados.txt')) fs.unlinkSync('resultados.txt');

    scrape().catch(err => console.error("💥 Erro na execução agendada:", err));
});

/**
 * Script Principal de Extração
 */
async function scrape() {
    console.log("🚀 Iniciando extração (Limite: 3 registros)...");

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();
    const initialUrl = 'https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/barueri?ps=1&pe=20000000&sp=6&f=p&o=1';

    try {
        await page.goto(initialUrl, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(5000);

        const allData = [];

        // Coletar links da primeira página
        const adUrls = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            return Array.from(new Set(links.map(a => a.href).filter(h => /\/imoveis\/.*-\d+$/.test(h) && !h.includes('/venda/'))));
        });

        console.log(`🔍 Anúncios encontrados na página: ${adUrls.length}`);

        for (const adUrl of adUrls) {
            if (allData.length >= 3) break;

            console.log(`   🔗 [${allData.length + 1}/3] Extraindo: ${adUrl.split('/').pop().substring(0, 30)}...`);
            const detailPage = await context.newPage();
            try {
                // Abortar imagens para ser rápido
                await detailPage.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
                await detailPage.goto(adUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
                await detailPage.waitForTimeout(2000);

                const price = await detailPage.evaluate(() => {
                    const priceSel = document.querySelector('span[data-testid="ad-price"]');
                    if (priceSel) return priceSel.innerText.trim();
                    const h2s = Array.from(document.querySelectorAll('h2'));
                    const priceH2 = h2s.find(h => h.innerText.includes('R$'));
                    return priceH2 ? priceH2.innerText.trim() : "N/A";
                });

                const phone = await detailPage.evaluate(() => {
                    const text = document.body.innerText;
                    const match = text.match(/(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-\s]?\d{4}/);
                    return match ? match[0].trim() : "Não informado";
                });

                allData.push({ link: adUrl, valor: price, telefone: phone });
                console.log(`      💰: ${price} | 📱: ${phone}`);
                generateTxt(allData);

            } catch (err) {
                console.log(`      ⚠️ Falha no item: ${err.message.substring(0, 40)}`);
            } finally {
                await detailPage.close();
            }
            await page.waitForTimeout(1000);
        }

    } catch (err) {
        console.error("💥 Erro Principal:", err.message);
    } finally {
        await browser.close();
    }
}

function generateTxt(data) {
    let content = `=== TESTE OLX BARUERI (LIMITE 3 ITENS) ===\nExecutado em: ${new Date().toLocaleString()}\n\n`;
    data.forEach((item, i) => {
        content += `${i + 1}. [VALOR: ${item.valor}] [FONE: ${item.telefone}]\n   LINK: ${item.link}\n`;
        content += `----------------------------------------------------\n`;
    });
    fs.writeFileSync('resultados.txt', content, 'utf8');
}
