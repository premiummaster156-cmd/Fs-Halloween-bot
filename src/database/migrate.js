require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { pool, transaction } = require("./pool");
const settings = require("../config/settings");

async function migrate() {
  if (!settings.databaseUrl) throw new Error("DATABASE_URL is missing. Configure PostgreSQL before migration or startup.");
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await transaction(async (client) => {
    await client.query(sql);
    const constraints = await client.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'players'::regclass " +
      "AND conname = ANY($1::text[])",
      [["players_level_600_check", "players_prestige_100_check"]]
    );
    const existing = new Set(constraints.rows.map((row) => row.conname));
    if (!existing.has("players_level_600_check")) {
      await client.query("ALTER TABLE players ADD CONSTRAINT players_level_600_check CHECK (level BETWEEN 1 AND 600)");
    }
    if (!existing.has("players_prestige_100_check")) {
      await client.query("ALTER TABLE players ADD CONSTRAINT players_prestige_100_check CHECK (prestige BETWEEN 0 AND 100)");
    }
  });
  console.log("[database] Schema applied.");
}

if (require.main === module) {
  migrate()
    .catch((error) => { console.error("[database] Migration failed:", error.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
module.exports = { migrate };
