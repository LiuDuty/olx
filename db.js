const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Inicializa o Firebase Admin
let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        serviceAccount = require('./firebase-key.json');
    }
} catch (e) {
    console.error("❌ ERRO GRAVE: Credenciais do Firebase ausentes. Verifique FIREBASE_SERVICE_ACCOUNT no .env ou firebase-key.json", e.message);
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const firestore = admin.firestore();

// Helper para converter timestamp do Firebase para Date
const toDate = (val) => {
    if (!val) return null;
    if (val.toDate) return val.toDate();
    if (val instanceof Date) return val;
    return new Date(val);
};

const db = {
    firestore,

    // Interface mock do Parse para manter compatibilidade
    Object: {
        extend: (className) => {
            const Cls = class {
                constructor() {
                    this.className = className;
                    this.attributes = {};
                    this.id = null;
                }
                get(key) { return this.attributes[key]; }
                set(key, val) { this.attributes[key] = val; }

                async save() {
                    let collectionName = "";
                    let docId = this.id;

                    if (className === "Listing") {
                        collectionName = "listings";
                        // Se não tem ID, tenta usar o link como base para evitar duplicatas
                        if (!docId && this.attributes.link) {
                            docId = Buffer.from(this.attributes.link.split('?')[0]).toString('base64').replace(/[/+=]/g, '');
                        }
                    } else if (className === "Config") {
                        collectionName = "configs";
                        docId = this.attributes.key;
                    } else if (className === "ScraperStatus") {
                        collectionName = "system";
                        docId = "status";
                    }

                    const data = { ...this.attributes };
                    // Converter datas
                    Object.keys(data).forEach(k => {
                        if (data[k] instanceof Date) {
                            data[k] = admin.firestore.Timestamp.fromDate(data[k]);
                        }
                    });

                    const ref = firestore.collection(collectionName).doc(docId || undefined);
                    await ref.set(data, { merge: true });
                    this.id = ref.id;
                    this.attributes.id = this.id;
                    this.attributes.objectId = this.id;
                }

                toJSON() {
                    const data = { ...this.attributes, objectId: this.id || this.attributes.objectId };
                    Object.keys(data).forEach(k => {
                        if (data[k] && data[k].toDate) data[k] = data[k].toDate();
                    });
                    return data;
                }
            };
            Cls.className = className;
            return Cls;
        },

        destroyAll: async (objects) => {
            const batch = firestore.batch();
            objects.forEach(obj => {
                let col = "";
                if (obj.className === "Listing") col = "listings";
                else if (obj.className === "Config") col = "configs";

                if (col && obj.id) {
                    batch.delete(firestore.collection(col).doc(obj.id));
                }
            });
            await batch.commit();
        }
    },

    Query: class {
        constructor(target) {
            this.className = typeof target === 'string' ? target : target.className;
            this.filters = [];
            this.sortField = null;
            this.sortOrder = 'desc';
            this.limitVal = 1000;
        }

        equalTo(key, value) {
            this.filters.push({ key, op: '==', value });
            return this;
        }

        notEqualTo(key, value) {
            this.filters.push({ key, op: '!=', value });
            return this;
        }

        descending(key) {
            this.sortField = key;
            this.sortOrder = 'desc';
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

        async get(id) {
            let col = "listings";
            if (this.className === "Config") col = "configs";

            const doc = await firestore.collection(col).doc(id).get();
            if (!doc.exists) throw new Error("Not found");

            const ExtendedClass = db.Object.extend(this.className);
            const obj = new ExtendedClass();
            obj.id = doc.id;
            obj.attributes = doc.data();
            return obj;
        }

        async find() {
            let collectionName = "";
            if (this.className === "Listing") collectionName = "listings";
            else if (this.className === "Config") collectionName = "configs";
            else if (this.className === "ScraperStatus") collectionName = "system";

            let query = firestore.collection(collectionName);

            // Se for ScraperStatus, sempre retorna o doc 'status'
            if (this.className === "ScraperStatus") {
                const doc = await query.doc("status").get();
                if (!doc.exists) return [];
                const ExtendedClass = db.Object.extend("ScraperStatus");
                const obj = new ExtendedClass();
                obj.id = "status";
                obj.attributes = doc.data();
                return [obj];
            }

            this.filters.forEach(f => {
                query = query.where(f.key, f.op, f.value);
            });

            // Firestore exige índice composto para where() + orderBy() em campos diferentes.
            // Quando há filtros, aplicamos apenas o limit no Firestore e ordenamos em memória.
            const hasFilters = this.filters.length > 0;

            if (this.sortField && !hasFilters) {
                // Sem filtros: ordenação nativa no Firestore
                query = query.orderBy(this.sortField, this.sortOrder);
            }

            query = query.limit(this.limitVal);

            const snapshot = await query.get();
            const ExtendedClass = db.Object.extend(this.className);

            let results = snapshot.docs.map(doc => {
                const obj = new ExtendedClass();
                obj.id = doc.id;
                obj.attributes = doc.data();
                return obj;
            });

            // Ordenação em memória quando há filtros (evita índice composto)
            if (this.sortField && hasFilters) {
                results.sort((a, b) => {
                    const va = a.attributes[this.sortField];
                    const vb = b.attributes[this.sortField];
                    const toMs = (v) => {
                        if (!v) return 0;
                        if (v && v.toDate) return v.toDate().getTime();
                        if (v instanceof Date) return v.getTime();
                        return new Date(v).getTime() || 0;
                    };
                    const diff = toMs(va) - toMs(vb);
                    return this.sortOrder === 'desc' ? -diff : diff;
                });
            }

            return results;
        }

        async count() {
            const items = await this.find();
            return items.length;
        }
    },

    // Funções auxiliares específicas
    async getConfig(key) {
        const doc = await firestore.collection('configs').doc(key).get();
        return doc.exists ? doc.data().value : null;
    },

    async setConfig(key, value) {
        await firestore.collection('configs').doc(key).set({ key, value: String(value) }, { merge: true });
    },

    // WhatsApp Status (Migrado para Firestore)
    async updateWhatsAppStatus(status, hasQr = false, qrData = null) {
        await firestore.collection('system').doc('whatsapp').set({
            status,
            hasQr,
            lastQr: qrData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    },

    async getWhatsAppStatus() {
        const doc = await firestore.collection('system').doc('whatsapp').get();
        return doc.exists ? doc.data() : { status: 'Desconectado', hasQr: false };
    },

    // Scraper Filters (Migrado para Firestore)
    async getScraperFilters() {
        const doc = await firestore.collection('system').doc('filters').get();
        return doc.exists ? doc.data() : {
            regions: ['tambore'],
            types: ['venda'],
            priceMin: 5000000,
            priceMax: 50000000
        };
    },

    async setScraperFilters(filters) {
        await firestore.collection('system').doc('filters').set(filters, { merge: true });
    }
};

module.exports = db;
