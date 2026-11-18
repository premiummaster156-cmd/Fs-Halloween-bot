"use strict";

require("dotenv").config();
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { pool, coopftPool, transaction, createTransaction } = require("./pool");
const settings = require("../config/settings");

const ADVISORY_LOCK_ID = 734921604;
const LEGACY_SCHEMA_NAME = "schema.sql";
const MIGRATION_FILE_PATTERN = /^([0-9]{4})_[a-z0-9][a-z0-9_-]*\.sql$/;

function checksum(sql) {
  return crypto.createHash("sha256").update(sql).digest("hex");
}

function readVersionedMigrations(migrationDirectory) {
  if (!fs.existsSync(migrationDirectory)) return [];

  const names = fs.readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const seenVersions = new Set();

  return names.map((name) => {
    const match = name.match(MIGRATION_FILE_PATTERN);
    if (!match) {
      throw new Error(
        "Invalid migration filename " + JSON.stringify(name) +
        '. Use the immutable format "NNNN_description.sql".'
      );
    }
    if (seenVersions.has(match[1])) {
      throw new Error("Duplicate database migration version: " + match[1]);
    }
    seenVersions.add(match[1]);

    const sql = fs.readFileSync(path.join(migrationDirectory, name), "utf8");
    if (!sql.trim()) throw new Error("Database migration is empty: " + name);
    return { name, sql, checksum: checksum(sql) };
  });
}

async function applyVersionedMigrations(client, migrations) {
  for (const migration of migrations) {
    const previous = await client.query(
      "SELECT checksum FROM schema_migrations WHERE migration_name = $1 FOR UPDATE",
      [migration.name]
    );
    const appliedChecksum = previous.rows[0]?.checksum;

    if (appliedChecksum) {
      if (appliedChecksum !== migration.checksum) {
        throw new Error(
          "Applied database migration " + migration.name +
          " was modified. Create a new migration instead of editing an applied migration."
        );
      }
      continue;
    }

    await client.query(migration.sql);
    await client.query(
      "INSERT INTO schema_migrations (migration_name, checksum) VALUES ($1, $2)",
      [migration.name, migration.checksum]
    );
    console.log("[database] Applied migration", migration.name);
  }
}

async function migrate(options = {}) {
  const databaseUrl = options.databaseUrl === undefined ? settings.databaseUrl : options.databaseUrl;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing. Configure PostgreSQL before migration or startup.");
  }

  const schemaPath = options.schemaPath || path.join(__dirname, "schema.sql");
  const migrationDirectory = options.migrationDirectory || path.join(__dirname, "migrations");
  const transactionFn = options.transactionFn || (options.pool ? createTransaction(options.pool) : transaction);
  const includeLegacySchema = options.includeLegacySchema !== false;
  const includePlayerConstraints = options.includePlayerConstraints !== false;
  const migrationFilter = typeof options.migrationFilter === "function" ? options.migrationFilter : () => true;
  const schemaSql = includeLegacySchema ? fs.readFileSync(schemaPath, "utf8") : null;
  const schemaChecksum = includeLegacySchema ? checksum(schemaSql) : null;
  const migrations = readVersionedMigrations(migrationDirectory).filter(migrationFilter);

  await transactionFn(async (client) => {
    // Serialize startup migrations so multiple bot instances cannot race through DDL/backfills.
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_ID]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (" +
      "migration_name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );

    if (includeLegacySchema) {
      const previousSchema = await client.query(
        "SELECT checksum FROM schema_migrations WHERE migration_name = $1 FOR UPDATE",
        [LEGACY_SCHEMA_NAME]
      );
      if (previousSchema.rows[0]?.checksum !== schemaChecksum) {
        // Preserve the existing idempotent schema bootstrap for installations already in production.
        await client.query(schemaSql);
        await client.query(
          "INSERT INTO schema_migrations (migration_name, checksum) VALUES ($1, $2) " +
          "ON CONFLICT (migration_name) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = NOW()",
          [LEGACY_SCHEMA_NAME, schemaChecksum]
        );
      }
    }

    // Numbered SQL migrations are immutable after application and execute in filename order.
    await applyVersionedMigrations(client, migrations);

    if (includePlayerConstraints) {
      const constraints = await client.query(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'players'::regclass " +
        "AND conname = ANY($1::text[])",
        [["players_level_600_check"]]
      );
      const existing = new Set(constraints.rows.map((row) => row.conname));
      if (!existing.has("players_level_600_check")) {
        await client.query(
          "ALTER TABLE players ADD CONSTRAINT players_level_600_check CHECK (level BETWEEN 1 AND 600)"
        );
      }
    }
  });

  console.log("[database] Schema and versioned migrations verified.");
}

async function migrateCoopFT(options = {}) {
  const existingFilter = typeof options.migrationFilter === "function" ? options.migrationFilter : () => true;
  const databasePool = options.pool || coopftPool;
  const databaseUrl = options.databaseUrl === undefined ? settings.coopftDatabaseUrl : options.databaseUrl;
  const transactionFn = options.transactionFn || (databasePool ? createTransaction(databasePool) : null);
  if (!databaseUrl || !transactionFn) {
    throw new Error("COOPFT_DATABASE_URL is missing. Configure a dedicated CoopFT Neon project before starting CoopFT services.");
  }
  return migrate({
    ...options,
    pool: databasePool,
    databaseUrl,
    transactionFn,
    // CoopFT uses only its dedicated migrations; Fukishokai's global player/game schema is not installed here.
    includeLegacySchema: false,
    includePlayerConstraints: false,
    migrationFilter: (migration) =>
      /^[0-9]{4}_coopft_[a-z0-9_-]+\.sql$/.test(migration.name) && existingFilter(migration)
  });
}

if (require.main === module) {
  migrate()
    .catch((error) => {
      console.error("[database] Migration failed:", error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = {
  migrate,
  migrateCoopFT,
  readVersionedMigrations,
  applyVersionedMigrations,
  checksum
};
