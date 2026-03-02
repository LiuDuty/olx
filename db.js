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
        },
        whatsapp: {
            status: "Iniciando...",
            hasQr: false,
            lastQr: null
        }
    }, null, 2));
}

const readDb = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDb = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const db = {
    // Simulando interface do Parse para minimizar mudanças no scraper.js
    Object: {
        extend: (className) => {
            const Cls = class {
                constructor() {
                    this.className = className;
                    this.attributes = {};
                }
                get(key) { return this.attributes[key]; }
                set(key, val) { this.attributes[key] = val; }
                async save() {
                    const data = readDb();
                    if (className === "Listing") {
                        const idx = data.listings.findIndex(l => l.link === this.attributes.link);
                        if (idx >= 0) data.listings[idx] = this.attributes;
                        else {
                            this.attributes.id = this.attributes.objectId = Math.random().toString(36).substring(2, 11);
                            data.listings.push(this.attributes);
                        }
                    } else if (className === "Config") {
                        data.config[this.attributes.key] = this.attributes.value;
                    } else if (className === "ScraperStatus") {
                        data.status = this.attributes;
                    }
                    writeDb(data);
                }
                toJSON() { return { ...this.attributes, objectId: this.attributes.objectId || this.attributes.id }; }
            };
            Cls.className = className;
            return Cls;
        }
    },

    Query: class {
        constructor(target) {
            this.className = typeof target === 'string' ? target : target.className;
            this.filters = [];
            this.sortField = null;
            this.limitVal = 1000;
        }

        equalTo(key, value) {
            this.filters.push(item => {
                const itemVal = item[key];
                return itemVal === value;
            });
            return this;
        }

        notEqualTo(key, value) {
            this.filters.push(item => {
                const itemVal = item[key];
                return itemVal !== value;
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
            const results = await this.find();
            return results.length > 0 ? results[0] : null;
        }

        wrap(obj, className) {
            if (!obj) return null;
            const ExtendedClass = db.Object.extend(className);
            const wrapper = new ExtendedClass();
            wrapper.attributes = obj;
            if (!wrapper.attributes.objectId && wrapper.attributes.id) {
                wrapper.attributes.objectId = wrapper.attributes.id;
            }
            return wrapper;
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
                return results.slice(0, this.limitVal).map(r => this.wrap(r, "Listing"));
            } else if (this.className === "Config") {
                // Para Config, retornamos um array de objetos { key, value } baseados no data.config
                return Object.entries(data.config).map(([key, value]) => {
                    const ConfigClass = db.Object.extend("Config");
                    const obj = new ConfigClass();
                    obj.set("key", key);
                    obj.set("value", value);
                    return obj;
                }).filter(item => this.filters.every(f => f(item.attributes)));
            } else if (this.className === "ScraperStatus") {
                const StatusClass = db.Object.extend("ScraperStatus");
                const obj = new StatusClass();
                Object.entries(data.status).forEach(([k, v]) => obj.set(k, v));
                const results = [obj];
                return results.filter(item => this.filters.every(f => f(item.attributes)));
            }
            return [];
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
