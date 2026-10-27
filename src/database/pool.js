const { Pool } = require("pg");
const settings = require("../config/settings");

const tls = /neon\.tech|sslmode=require/i.test(settings.databaseUrl);
const pool = new Pool({
  ...(settings.databaseUrl ? { connectionString: settings.databaseUrl } : {}),
  max: Math.max(2, Math.min(20, Number(process.env.DB_POOL_MAX || 10))),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ...(tls ? { ssl: { rejectUnauthorized: false } } : {})
});
pool.on("error", (error) => console.error("[database] Idle client error:", error.message));

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (rollbackError) {
      console.error("[database] Rollback failed:", rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, transaction };
