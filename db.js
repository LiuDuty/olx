const Parse = require('parse/node');
require('dotenv').config();

Parse.initialize(
    process.env.PARSE_APP_ID,
    process.env.PARSE_JS_KEY,
    process.env.PARSE_MASTER_KEY
);
Parse.serverURL = process.env.PARSE_SERVER_URL;

module.exports = Parse;
