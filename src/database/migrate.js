require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { pool, transaction } = require("./pool");

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await transaction(async (client) => { await client.query(sql); });
  console.log("[database] Schema applied.");
}

if (require.main === module) {
  migrate()
    .catch((error) => { console.error("[database] Migration failed:", error.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
module.exports = { migrate };
