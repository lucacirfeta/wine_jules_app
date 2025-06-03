// Database constants
const DB_NAME = 'wineloggerdb';
const WINES_TABLE = 'wines';
let db; // Stores the database connection instance

/**
 * Initializes the SQLite database connection.
 * Creates the 'wines' table if it doesn't exist and adds sample data if the table is empty.
 * @returns {Promise<SQLiteDBConnection>} The database connection object.
 */
async function initializeDatabase() {
    // Dynamically import Capacitor SQLite plugin
    const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
    const sqlite = new SQLiteConnection(CapacitorSQLite);

    try {
        // Required for web platform to ensure encryption secret is set if DB was encrypted
        // This check might need adjustment based on exact plugin version behavior for web.
        if (Capacitor.getPlatform() === 'web' && (await CapacitorSQLite.isSecretStored()).result) {
            await CapacitorSQLite.setEncryptionSecret('mysecret');
        }

        const ret = await sqlite.checkConnectionsConsistency();
        const isConn = (await sqlite.isConnection(DB_NAME, false)).result;

        // Retrieve existing connection or create a new one
        if (ret.result && isConn) {
            db = await sqlite.retrieveConnection(DB_NAME, false);
        } else {
            db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
        }

        await db.open();
        console.log("Database connection opened successfully.");

        // Define and execute schema for the wines table
        const schema = \`
            CREATE TABLE IF NOT EXISTS \${WINES_TABLE} (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                vintage TEXT,
                varietal TEXT,
                appellation TEXT,
                alcohol TEXT,
                price TEXT,
                type TEXT,
                notes TEXT,
                rating INTEGER,
                image_path TEXT
            );
            CREATE INDEX IF NOT EXISTS name_idx ON \${WINES_TABLE} (name);
        \`;
        await db.execute(schema);
        console.log("Database schema executed. Wines table ensured.");

        // Optional: Add initial sample data if the table is empty
        const initialDataCheck = await db.query(\`SELECT COUNT(*) as count FROM \${WINES_TABLE};\`);
        if (initialDataCheck.values && initialDataCheck.values[0].count === 0) {
            console.log("No data found in wines table, adding initial sample wines...");
            const sampleWines = [
                { id: "cabernet-sauvignon-2018", name: "Cabernet Sauvignon", vintage: "2018", type: "Red", rating: 7, image_path: "https://via.placeholder.com/150/800000/FFFFFF?Text=Cabernet", varietal: "Cabernet Sauvignon", appellation: "Napa Valley", alcohol: "14.5%", price: "$50", notes: "Bold and fruity." },
                { id: "pinot-noir-2019", name: "Pinot Noir", vintage: "2019", type: "Red", rating: 8, image_path: "https://via.placeholder.com/150/A52A2A/FFFFFF?Text=Pinot+Noir", varietal: "Pinot Noir", appellation: "Willamette Valley", alcohol: "13.5%", price: "$45", notes: "Earthy and elegant." }
            ];
            for (const wine of sampleWines) {
                const query = \`INSERT INTO \${WINES_TABLE} (id, name, vintage, varietal, appellation, alcohol, price, type, notes, rating, image_path) VALUES (?,?,?,?,?,?,?,?,?,?,?);\`;
                await db.run(query, [wine.id, wine.name, wine.vintage, wine.varietal, wine.appellation, wine.alcohol, wine.price, wine.type, wine.notes, wine.rating, wine.image_path]);
            }
            console.log("Sample data added to wines table.");
        }
        return db;
    } catch (err) {
        console.error("SQLite initialization error: ", err);
        const errorMessage = err.message ? err.message : String(err);
        // Gracefully handle "already created" or "already open" error which can happen in some contexts
        if (errorMessage.includes("already created") || errorMessage.includes("already open") || errorMessage.includes("already_open")) {
             if (!db) db = await sqlite.retrieveConnection(DB_NAME, false); // Ensure db is assigned
             if (db && !(await db.isOpen()).result) await db.open(); // Ensure db is open
             console.warn("Database already existed or connection was already open.");
             return db;
        }
        // Re-throw other errors to be caught by calling functions
        throw new Error(\`Database initialization failed: \${errorMessage}\`);
    }
}

/**
 * Retrieves all wines from the database, ordered by name.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of wine objects.
 */
async function getAllWinesDB() {
    if (!db || !(await db.isOpen()).result) await initializeDatabase(); // Ensure DB is initialized and open
    try {
        const result = await db.query(\`SELECT * FROM \${WINES_TABLE} ORDER BY name ASC;\`);
        return result.values || [];
    } catch (err) {
        console.error("Error getting all wines:", err);
        throw new Error("Failed to retrieve wines from database.");
    }
}

/**
 * Adds a new wine to the database.
 * @param {Object} wine - The wine object to add. Must include 'name'. ID is auto-generated if not provided.
 * @returns {Promise<Object>} A promise that resolves to the result of the insert operation.
 */
async function addWineDB(wine) {
    if (!db || !(await db.isOpen()).result) await initializeDatabase();
    try {
        const query = \`INSERT INTO \${WINES_TABLE} (id, name, vintage, varietal, appellation, alcohol, price, type, notes, rating, image_path)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?);\`;
        const params = [
            wine.id || self.crypto.randomUUID(),
            wine.name, wine.vintage || null, wine.varietal || null, wine.appellation || null,
            wine.alcohol || null, wine.price || null, wine.type || null, wine.notes || null,
            wine.rating || 0, wine.image_path || null
        ];
        const result = await db.run(query, params);
        if (!result.changes || result.changes === 0) throw new Error("No rows inserted, database operation may have failed silently.");
        return result;
    } catch (err) {
        console.error("Error adding wine:", err);
        throw new Error(\`Failed to add wine to database: \${err.message}\`);
    }
}

/**
 * Retrieves a specific wine by its ID.
 * @param {string} id - The ID of the wine to retrieve.
 * @returns {Promise<Object|null>} A promise that resolves to the wine object, or null if not found.
 */
async function getWineByIdDB(id) {
    if (!db || !(await db.isOpen()).result) await initializeDatabase();
    try {
        const result = await db.query(\`SELECT * FROM \${WINES_TABLE} WHERE id = ?;\`, [id]);
        if (!result.values || result.values.length === 0) return null; // Wine not found
        return result.values[0];
    } catch (err) {
        console.error(\`Error getting wine by ID (\${id}):\`, err);
        throw new Error("Failed to retrieve wine details.");
    }
}

/**
 * Updates an existing wine in the database.
 * @param {Object} wine - The wine object to update. Must include 'id'.
 * @returns {Promise<Object>} A promise that resolves to the result of the update operation.
 */
async function updateWineDB(wine) {
    if (!db || !(await db.isOpen()).result) await initializeDatabase();
    try {
        const query = \`UPDATE \${WINES_TABLE} SET
                       name = ?, vintage = ?, varietal = ?, appellation = ?, alcohol = ?,
                       price = ?, type = ?, notes = ?, rating = ?, image_path = ?
                       WHERE id = ?;\`;
        const params = [
            wine.name, wine.vintage || null, wine.varietal || null, wine.appellation || null,
            wine.alcohol || null, wine.price || null, wine.type || null, wine.notes || null,
            wine.rating || 0, wine.image_path || null, wine.id
        ];
        const result = await db.run(query, params);
        if (!result.changes || result.changes === 0) throw new Error("No rows updated. Wine ID might be incorrect or data unchanged.");
        return result;
    } catch (err) {
        console.error(\`Error updating wine (\${wine.id}):\`, err);
        throw new Error(\`Failed to update wine: \${err.message}\`);
    }
}

/**
 * Deletes a wine from the database by its ID.
 * @param {string} id - The ID of the wine to delete.
 * @returns {Promise<Object>} A promise that resolves to the result of the delete operation.
 */
async function deleteWineDB(id) {
    if (!db || !(await db.isOpen()).result) await initializeDatabase();
    try {
        const query = \`DELETE FROM \${WINES_TABLE} WHERE id = ?;\`;
        const result = await db.run(query, [id]);
        if (!result.changes || result.changes === 0) throw new Error("No rows deleted. Wine ID might be incorrect.");
        return result;
    } catch (err) {
        console.error(\`Error deleting wine (\${id}):\`, err);
        throw new Error("Failed to delete wine from database.");
    }
}
