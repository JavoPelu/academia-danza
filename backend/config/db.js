const { Pool } = require('pg');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

(async () => {
  try {
    await db.query('SELECT NOW()');
    console.log('✅ Conectado a PostgreSQL (Neon)');
  } catch (err) {
    console.error('❌ Error conexión:', err);
  }
})();

module.exports = db;