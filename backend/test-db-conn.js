require('dotenv').config();
const db = require('./config/db');

(async () => {
  try {
    const [rows] = await db.query('SELECT NOW()');
    console.log('Conexión OK. NOW():', rows);
    process.exit(0);
  } catch (err) {
    console.error('Fallo conexión:', err.message || err);
    process.exit(1);
  }
})();
