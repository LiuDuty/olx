const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const db = require('./db');
require('dotenv').config();

const TELEFONE_DESTINO = process.env.TELEFONE_DESTINO || '5511975040117';
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || '2U1KDYckXbPO4pc065f0e047f92f67e4ab2dbe8e65ac0fd55';
const BROWSERLESS_WS = `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}`;
const QUEUE_DIR = path.join(__dirname, 'whatsapp_queue');

// Certifica que a pasta de fila existe
if (!fs.existsSync(QUEUE_DIR)) {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
}

console.log('🚀 [WhatsApp Service] Iniciando...');

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
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

async function updateWhatsAppStatus(status, hasQr = false, qrData = null) {
    const DB_FILE = path.join(__dirname, 'db.json');
    if (!fs.existsSync(DB_FILE)) return;

    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        data.whatsapp = {
            status,
            hasQr,
            lastQr: qrData,
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Erro ao atualizar status do WhatsApp no DB:', e.message);
    }
}

client.on('qr', (qr) => {
    console.log('📱 QR CODE GERADO! Escaneie no Web App.');
    qrcodeTerminal.generate(qr, { small: true });
    updateWhatsAppStatus('Aguardando Scan', true, qr);
});

client.on('ready', () => {
    console.log('✅ WHATSAPP: Cliente pronto e conectado!');
    updateWhatsAppStatus('Conectado e Pronto', false, null);
});

client.on('authenticated', () => {
    console.log('🔓 WHATSAPP: Autenticado com sucesso!');
    updateWhatsAppStatus('Autenticado (Carregando...)', false, null);
});

client.on('auth_failure', (msg) => {
    console.error('❌ WHATSAPP: Falha na autenticação:', msg);
    updateWhatsAppStatus('Falha na Autenticação', false, null);
});

client.on('disconnected', (reason) => {
    console.log('❌ WHATSAPP: Cliente desconectado:', reason);
    updateWhatsAppStatus('Desconectado', false, null);
    setTimeout(() => {
        console.log('🔄 Tentando re-inicializar WhatsApp...');
        client.initialize();
    }, 10000);
});

// ==========================================
// MONITOR DE FILA (QUEUE)
// ==========================================
async function processQueue() {
    const files = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json'));

    if (files.length === 0) return;

    console.log(`📂 [Queue] Encontrados ${files.length} pacotes para enviar.`);

    for (const file of files) {
        const filePath = path.join(QUEUE_DIR, file);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);

            console.log(`📤 Enviando mensagem do arquivo: ${file}`);
            await sendMessage(data);

            // Sucesso -> Deleta o arquivo
            fs.unlinkSync(filePath);
            console.log(`✅ Arquivo ${file} processado e removido.`);
        } catch (err) {
            console.error(`❌ Erro ao processar ${file}:`, err.message);
            // Move para .error para não travar o loop? 
            // Por enquanto vamos apenas deixar lá e tentar de novo no próximo ciclo
        }
    }
}

async function sendMessage(data) {
    try {
        const summary = generateSummary(data);
        const chat = await client.getChatById(`${TELEFONE_DESTINO}@c.us`);
        await chat.sendMessage(`🚀 Extração Finalizada!\n\n${summary}\n\nConfira no Web App.`);
        console.log("✅ WHATSAPP: Mensagem enviada!");
    } catch (err) {
        throw new Error(`Erro ao enviar WhatsApp: ${err.message}`);
    }
}

function generateSummary(data) {
    let summary = "";
    const items = Array.isArray(data) ? data : [data];
    items.slice(0, 10).forEach((item, i) => {
        const waLink = generateWhatsAppLink(item.telefone);
        summary += `${i + 1}. 💰 ${item.valor}\n👤 ${item.contactName || 'N/A'}\n📞 ${item.telefone}\n🔗 ${item.link}\n💬 ${waLink || 'N/A'}\n\n`;
    });
    if (items.length > 10) summary += `... e mais ${items.length - 10} itens.`;
    return summary;
}

function generateWhatsAppLink(phone) {
    if (!phone || phone === "Não informado") return null;
    const digits = phone.replace(/\D/g, '');
    const fullNumber = digits.length <= 11 ? '55' + digits : digits;
    const message = encodeURIComponent("Olá! Vi seu anúncio e quero saber mais");
    return `https://wa.me/${fullNumber}?text=${message}`;
}

// Check queue every 10 seconds
setInterval(processQueue, 10000);

// Start client
client.initialize().catch(err => {
    console.error('Falha na inicialização do WhatsApp:', err.message);
    updateWhatsAppStatus('Erro ao carregar', false, null);
});
