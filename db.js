const Parse = require('parse/node');
require('dotenv').config();

// Garante que não usemos strings vazias das variáveis de ambiente
const getEnv = (key, fallback) => {
    const val = process.env[key];
    return (val && val.trim() !== "") ? val : fallback;
};

const APP_ID = getEnv("PARSE_APP_ID", "kPphx4UiPzkVLXZbdG6D0ibRi1KQARQ1uMsxWPQr");
const JS_KEY = getEnv("PARSE_JS_KEY", "bVidsnN1GWSVGnYnMdHvPBxHw39YDcVMwqr5nQlG");
const MASTER_KEY = getEnv("PARSE_MASTER_KEY", getEnv("MASTER_KEY", null));
const SERVER_URL = getEnv("PARSE_SERVER_URL", 'https://parseapi.back4app.com');

console.log(`🛠️ [DB] Inicializando... (ID: ${APP_ID.substring(0, 5)}...)`);

try {
    Parse.initialize(APP_ID, JS_KEY, MASTER_KEY);
    Parse.serverURL = SERVER_URL;
    Parse.hasMasterKey = !!MASTER_KEY;

    if (MASTER_KEY) {
        console.log("🔑 [DB] Master Key detectada! Acesso administrativo liberado.");
    } else {
        console.warn("⚠️ [DB] Nenhuma Master Key detectada. Erros de 'unauthorized' podem ocorrer.");
    }
} catch (err) {
    console.error("💥 [DB] Erro fatal na inicialização do Parse:", err);
}

module.exports = Parse;
