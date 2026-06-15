const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.NEON_DATABASE_URL ||
  process.env.NEON_DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error('DATABASE_URL, DATABASE_URL_UNPOOLED, NEON_DATABASE_URL or NEON_DATABASE_URL_UNPOOLED must be set');
}

const createPool = () => new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  // Serverless-friendly defaults; override with env vars if needed
  max: process.env.PG_MAX ? Number(process.env.PG_MAX) : 6,
  idleTimeoutMillis: process.env.PG_IDLE_MS ? Number(process.env.PG_IDLE_MS) : 30000,
  connectionTimeoutMillis: process.env.PG_CONN_TIMEOUT_MS ? Number(process.env.PG_CONN_TIMEOUT_MS) : 2000
});

// Reuse pool across hot-reloads / serverless invocations (Vercel lambdas)
const pool = globalThis.__pgPool || (globalThis.__pgPool = createPool());

const prepareQuery = (text, params = []) => {
  if (!params || params.length === 0) {
    return { text, values: [] };
  }

  let index = 0;
  const values = [];
  const newText = text.replace(/\?/g, () => {
    index += 1;
    values.push(params[index - 1]);
    return `$${index}`;
  });

  return { text: newText, values };
};

const query = async (text, params) => {
  const { text: sql, values } = prepareQuery(text, params);
  const result = await pool.query(sql, values);
  return [result.rows, result];
};

(async () => {
  try {
    await query('SELECT NOW()');
    console.log('✅ Conectado a PostgreSQL (Neon)');
  } catch (err) {
    console.error('❌ Error conexión (no se aborta el proceso):', err.message || err);
    // Do not exit here; allow the runtime to surface errors in logs (especially on Vercel)
  }
})();

module.exports = { query, pool };
