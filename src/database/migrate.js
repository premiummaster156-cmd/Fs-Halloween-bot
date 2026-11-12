require("dotenv").config();
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { pool, transaction } = require("./pool");
const settings = require("../config/settings");

async function migrate() {
  if (!settings.databaseUrl) throw new Error("DATABASE_URL is missing. Configure PostgreSQL before migration or startup.");
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const checksum = crypto.createHash("sha256").update(sql).digest("hex");
  await transaction(async (client) => {
    // Serialize startup migrations so multiple bot instances cannot race through DDL/backfills.
    await client.query("SELECT pg_advisory_xact_lock($1)", [734921604]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (" +
      "migration_name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
    const previous = await client.query(
      "SELECT checksum FROM schema_migrations WHERE migration_name = $1 FOR UPDATE",
      ["schema.sql"]
    );
    if (previous.rows[0]?.checksum !== checksum) {
      // schema.sql is kept idempotent; reapply it only when its contents change.
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (migration_name, checksum) VALUES ($1, $2) " +
        "ON CONFLICT (migration_name) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = NOW()",
        ["schema.sql", checksum]
      );
    }
    const constraints = await client.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'players'::regclass " +
      "AND conname = ANY($1::text[])",
      [["players_level_600_check"]]
    );
    const existing = new Set(constraints.rows.map((row) => row.conname));
    if (!existing.has("players_level_600_check")) {
      await client.query("ALTER TABLE players ADD CONSTRAINT players_level_600_check CHECK (level BETWEEN 1 AND 600)");
    }
  });
  console.log("[database] Schema checksum verified.");
}

if (require.main === module) {
  migrate()
    .catch((error) => { console.error("[database] Migration failed:", error.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
module.exports = { migrate };
