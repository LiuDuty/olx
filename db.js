const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

// Inicializa o arquivo se não existir
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
        listings: [],
        config: {
            next_run: null,
            limit_enabled: "true",
            limit_value: "50"
        },
        status: {
            message: "Aguardando...",
            progress: 0,
            currentItem: null,
            links: []
        }
    }, null, 2));
}

const readDb = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDb = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const db = {
    // Simulando interface do Parse para minimizar mudanças no scraper.js
    Object: {
        extend: (className) => className
    },

    Query: class {
        constructor(className) {
            this.className = className;
            this.filters = [];
            this.sortField = null;
            this.limitVal = 1000;
        }

        equalTo(key, value) {
            this.filters.push(item => {
                // No caso do JSON, campos como isFavorite são booleanos
                const val = typeof value === 'string' ? value.toLowerCase() : value;
                const itemVal = item[key];
                return itemVal === value;
            });
            return this;
        }

        descending(key) {
            this.sortField = key;
            return this;
        }

        limit(val) {
            this.limitVal = val;
            return this;
        }

        async first() {
            const data = readDb();
            let obj = null;
            if (this.className === "Listing") {
                const results = await this.find();
                obj = results.length > 0 ? results[0].attributes : null;
            } else if (this.className === "Config") {
                // Acha a chave no filtro: item => item.key === value
                // Nossa implementação de first() para Config precisa identificar qual chave está sendo buscada
                // No scraper usamos query.equalTo("key", "nome_da_chave")
                // Como simplificação, vamos buscar no data.config
                // Mas para ser fiel ao Parse, precisamos ver o filtro
                // Vamos usar um truque: se houver um filtro do tipo k===v, pegamos v
                const results = data.listings.filter(item => this.filters.every(f => f(item))); // Não serve para Config
                // Config no db.json é { next_run: ..., ... }
                // Vamos retornar um wrapper que aponta para a chave certa
                return this.wrapConfig(data);
            } else if (this.className === "ScraperStatus") {
                return this.wrap(data.status, "ScraperStatus");
            }
            return obj ? this.wrap(obj, this.className) : null;
        }

        wrapConfig(data) {
            // No scraper.js: let config = await query.first() || new Config(); config.set("value", val); await config.save();
            // Precisamos saber QUAL chave. Como o scraper faz query.equalTo("key", "X") antes
            // Vamos tentar capturar isso na Query
            const keyFilter = this.keySearched;
            if (!keyFilter) return null;

            const val = data.config[keyFilter];
            return {
                get: (k) => k === "value" ? data.config[keyFilter] : keyFilter,
                set: (k, v) => { if (k === "value") data.config[keyFilter] = v; },
                save: async () => writeDb(data),
                toJSON: () => ({ key: keyFilter, value: data.config[keyFilter] })
            };
        }

        async find() {
            const data = readDb();
            let results = [];
            if (this.className === "Listing") {
                results = data.listings.filter(item => {
                    return this.filters.every(f => f(item));
                });
                if (this.sortField) {
                    results.sort((a, b) => new Date(b[this.sortField]) - new Date(a[this.sortField]));
                }
            }
            return results.slice(0, this.limitVal).map(r => this.wrap(r, "Listing"));
        }

        async count() {
            const items = await this.find();
            return items.length;
        }

        async get(id) {
            const data = readDb();
            const item = data.listings.find(l => (l.objectId || l.id) === id);
            if (!item) throw new Error("Not found");
            return this.wrap(item, "Listing");
        }

        wrap(obj, className) {
            if (!obj) return null;
            return {
                id: obj.objectId || obj.id,
                attributes: obj,
                get: (key) => obj[key],
                set: (key, val) => { obj[key] = val },
                save: async () => {
                    const data = readDb();
                    if (className === "Listing") {
                        const idx = data.listings.findIndex(l => l.link === obj.link);
                        if (idx >= 0) data.listings[idx] = obj;
                        else {
                            obj.objectId = Math.random().toString(36).substring(2, 11);
                            data.listings.push(obj);
                        }
                    } else if (className === "ScraperStatus") {
                        data.status = obj;
                    }
                    writeDb(data);
                },
                toJSON: () => {
                    return { ...obj, objectId: obj.objectId || obj.id };
                }
            };
        }
    },

    // Funções auxiliares para uso direto no scraper.js
    async getConfig(key) {
        const data = readDb();
        return data.config[key];
    },

    async setConfig(key, value) {
        const data = readDb();
        data.config[key] = value;
        writeDb(data);
    },

    async destroyAll(objects) {
        const data = readDb();
        const linksToRemove = objects.map(o => o.get("link"));
        data.listings = data.listings.filter(l => !linksToRemove.includes(l.link));
        writeDb(data);
    }
};

module.exports = db;
