const { Pool } = require("pg");
const settings = require("../config/settings");

function withVerifiedSslMode(connectionString) {
  if (!connectionString || typeof connectionString !== "string") return connectionString;

  const modeMatch = connectionString.match(/([?&])sslmode=([^&#]*)/i);
  if (modeMatch) {
    const mode = modeMatch[2].toLowerCase();
    // pg-connection-string's legacy aliases mapped these modes to verify-full.
    // Make that behavior explicit rather than opting into weaker libpq semantics.
    if (["require", "prefer", "verify-ca"].includes(mode)) {
      return connectionString.replace(modeMatch[0], modeMatch[1] + "sslmode=verify-full");
    }
    return connectionString;
  }

  // Neon requires TLS. Make certificate and hostname verification explicit
  // even when a deployment URL omitted the sslmode query parameter.
  if (/\.neon\.tech(?:[/:?#]|$)/i.test(connectionString)) {
    return connectionString + (connectionString.includes("?") ? "&" : "?") + "sslmode=verify-full";
  }
  return connectionString;
}

const connectionString = withVerifiedSslMode(settings.databaseUrl);
const pool = new Pool({
  ...(connectionString ? { connectionString } : {}),
  max: Math.max(2, Math.min(20, Number(process.env.DB_POOL_MAX || 10))),
  // Release unused PostgreSQL clients quickly so Neon can autosuspend when the bot is idle.
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000
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

module.exports = { pool, transaction, withVerifiedSslMode };
