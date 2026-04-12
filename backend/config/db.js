const mysql = require("mysql2/promise"); // Usa promesas

const db = mysql.createPool({ // Usa pool para mejor rendimiento
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "", // Usa env vars
    database: process.env.DB_NAME || "academia_danza",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

(async () => {
    try {
        await db.getConnection();
        console.log("✅ Conectado a MySQL");
    } catch (err) {
        console.log("❌ Error conexión:", err);
        process.exit(1); // Cierra la app en error crítico
    }
})();

module.exports = db;
