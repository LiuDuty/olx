const Parse = require('./db');

async function checkDb() {
    try {
        const Listing = Parse.Object.extend("Listing");
        const query = new Parse.Query(Listing);
        const count = await query.count({ useMasterKey: true });
        console.log(`Total listings in DB: ${count}`);

        const listings = await query.limit(5).find({ useMasterKey: true });
        listings.forEach(l => {
            console.log(`- ${l.get('price')} | ${l.get('status')} | ${l.get('link')}`);
        });
    } catch (e) {
        console.error("Error checking DB:", e.message);
    }
}

checkDb();
