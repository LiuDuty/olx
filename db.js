const Parse = require('parse/node');
require('dotenv').config();

const APP_ID = process.env.PARSE_APP_ID || "kPphx4UiPzkVLXZbdG6D0ibRi1KQARQ1uMsxWPQr";
const JS_KEY = process.env.PARSE_JS_KEY || "bVidsnN1GWSVGnYnMdHvPBxHw39YDcVMwqr5nQlG";
const MASTER_KEY = process.env.PARSE_MASTER_KEY; // Master key must be env var for security
const SERVER_URL = process.env.PARSE_SERVER_URL || 'https://parseapi.back4app.com/';

console.log(`🛠️ Inicializando Parse com AppID: ${APP_ID.substring(0, 5)}...`);
if (!MASTER_KEY) console.warn("⚠️ AVISO: PARSE_MASTER_KEY não configurada. Operações de MasterKey podem falhar.");

Parse.initialize(APP_ID, JS_KEY, MASTER_KEY);
Parse.serverURL = SERVER_URL;

module.exports = Parse;
