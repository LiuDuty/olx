/**
 * DIAGNÓSTICO: Descobre qual endpoint a OLX chama ao clicar "Ver telefone"
 * e o que retorna (para entender como capturar o telefone)
 */
const { chromium } = require('playwright');

async function diagnose() {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    // Captura TODAS as chamadas de rede
    const calls = [];
    page.on('request', req => {
        calls.push({ type: 'REQUEST', url: req.url(), method: req.method() });
    });
    page.on('response', async res => {
        const url = res.url();
        // Filtra apenas chamadas potencialmente relacionadas ao anúncio/telefone
        if (!url.includes('.css') && !url.includes('.js') && !url.includes('image') &&
            !url.includes('.png') && !url.includes('.jpg') && !url.includes('font')) {
            let body = '';
            try {
                const ct = res.headers()['content-type'] || '';
                if (ct.includes('json')) {
                    const json = await res.json().catch(() => null);
                    body = JSON.stringify(json).substring(0, 200);
                }
            } catch (_) { }
            calls.push({ type: 'RESPONSE', url, status: res.status(), body });
        }
    });

    // Pega o primeiro link da página de listagem
    console.log('📄 Carregando lista...');
    await page.goto('https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/alphaville?q=imoveis&sf=1&o=1',
        { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    const firstLink = await page.evaluate(() => {
        const a = document.querySelector('a.olx-adcard__link');
        return a ? a.href.split('?')[0] : null;
    });

    if (!firstLink) { console.log('❌ Nenhum link encontrado'); await browser.close(); return; }
    console.log('🔗 Primeiro anúncio:', firstLink);

    // Entra no anúncio
    calls.length = 0; // Limpa chamadas da lista
    await page.goto(firstLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Verifica o que tem na página
    const pageInfo = await page.evaluate(() => {
        const btn = document.querySelector('button#price-box-button-show-phone') ||
            document.querySelector('button[data-testid="show-phone-button"]');
        const tel = document.querySelector('a[href^="tel:"]');
        return {
            hasPhoneButton: !!btn,
            buttonText: btn ? btn.innerText.trim() : null,
            hasTelLink: !!tel,
            telHref: tel ? tel.href : null,
        };
    });
    console.log('\n📋 Estado da página:', JSON.stringify(pageInfo, null, 2));

    // Clica no botão se existir
    if (pageInfo.hasPhoneButton) {
        console.log('\n🖱️ Clicando no botão "Ver telefone"...');
        calls.length = 0;

        const btn = page.locator('button#price-box-button-show-phone, button[data-testid="show-phone-button"]').first();
        await btn.click({ timeout: 5000 });
        await page.waitForTimeout(3000);

        // Mostra todas as chamadas feitas após o clique
        console.log('\n🌐 CHAMADAS APÓS O CLIQUE:');
        for (const c of calls) {
            if (c.type === 'RESPONSE') {
                console.log(`  [${c.status}] ${c.url}`);
                if (c.body) console.log(`        Body: ${c.body}`);
            }
        }

        // Verifica DOM após o clique
        const afterClick = await page.evaluate(() => {
            const tel = document.querySelector('a[href^="tel:"]');
            const btn = document.querySelector('button#price-box-button-show-phone');
            return {
                telLink: tel ? tel.href : null,
                buttonNowText: btn ? btn.innerText.trim() : null,
                // Tenta achar qualquer número que apareceu
                pageText: document.body.innerText.substring(0, 2000),
            };
        });

        console.log('\n📱 DOM APÓS CLIQUE:');
        console.log('  tel link:', afterClick.telLink);
        console.log('  botão texto:', afterClick.buttonNowText);

        // Busca números no texto
        const phones = afterClick.pageText.match(/\(\d{2}\)\s*9?\d{4}[-.\s]?\d{4}|\d{2}9\d{8}/g);
        console.log('  Telefones encontrados:', phones ? [...new Set(phones)] : 'nenhum');
    } else {
        console.log('\n⚠️ Botão "Ver telefone" NÃO encontrado na página');
        console.log('URL atual:', page.url());
    }

    await browser.close();
}

diagnose().catch(console.error);
