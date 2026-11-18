const { Pool } = require("pg");
const settings = require("../config/settings");

function withVerifiedSslMode(connectionString) {
  if (!connectionString || typeof connectionString !== "string") return connectionString;

  const modeMatch = connectionString.match(/([?&])sslmode=([^&#]*)/i);
  if (modeMatch) {
    const mode = modeMatch[2].toLowerCase();
    if (["require", "prefer", "verify-ca"].includes(mode)) {
      return connectionString.replace(modeMatch[0], modeMatch[1] + "sslmode=verify-full");
    }
    return connectionString;
  }

  if (/\.neon\.tech(?:[/:?#]|$)/i.test(connectionString)) {
    return connectionString + (connectionString.includes("?") ? "&" : "?") + "sslmode=verify-full";
  }
  return connectionString;
}

function databaseHost(connectionString, variableName) {
  if (!connectionString) return null;
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(variableName + " must be a valid PostgreSQL connection URL.");
  }
  return parsed.hostname.toLowerCase();
}

function createDatabasePool(connectionString, label, options = {}) {
  const verified = withVerifiedSslMode(connectionString);
  const pool = new Pool({
    ...(verified ? { connectionString: verified } : {}),
    max: Math.max(2, Math.min(20, Number(process.env.DB_POOL_MAX || 10))),
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    ...options
  });
  pool.on("error", (error) => console.error("[" + label + "] Idle client error:", error.message));
  return pool;
}

function createTransaction(databasePool) {
  if (!databasePool || typeof databasePool.connect !== "function") {
    throw new TypeError("A PostgreSQL pool is required to start a transaction.");
  }
  return async function transaction(callback) {
    const client = await databasePool.connect();
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
  };
}

// DATABASE_URL belongs to Fukishokai. It is never used as a CoopFT fallback.
const pool = createDatabasePool(settings.databaseUrl, "database");
const sourceHost = databaseHost(settings.databaseUrl, "DATABASE_URL");
const coopftHost = databaseHost(settings.coopftDatabaseUrl, "COOPFT_DATABASE_URL");
if (sourceHost && coopftHost && sourceHost === coopftHost) {
  throw new Error(
    "COOPFT_DATABASE_URL must point to a separate Neon project/endpoint from DATABASE_URL."
  );
}
const coopftPool = settings.coopftDatabaseUrl
  ? createDatabasePool(settings.coopftDatabaseUrl, "coopft-database")
  : null;

const transaction = createTransaction(pool);

module.exports = {
  pool,
  transaction,
  coopftPool,
  createDatabasePool,
  createTransaction,
  withVerifiedSslMode
};
