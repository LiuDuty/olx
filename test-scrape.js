const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

async function testScrape() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    const url = 'https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/alphaville?ps=1&pe=20000000&sp=6&f=p&o=1';

    console.log("Navigating...");
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });

    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a.olx-adcard__link'))
            .map(a => a.href);
    });

    console.log("Links found by class:", links.length);
    if (links.length > 0) {
        console.log("First Ad Link:", links[0]);
        await page.goto(links[0], { waitUntil: 'load', timeout: 45000 });
        const data = await page.evaluate(() => {
            const price = document.querySelector('span.typo-title-medium') ||
                document.querySelector('h2.ad-price') ||
                document.querySelector('[data-testid="ad-price"]');
            const seller = document.querySelector('span.typo-body-large') ||
                document.querySelector('[data-testid="ad-seller-name"]');
            return {
                price: price ? price.innerText : "NOT_FOUND",
                seller: seller ? seller.innerText : "NOT_FOUND"
            };
        });
        console.log("Data:", data);
    }

    await browser.close();
}

testScrape().catch(console.error);
