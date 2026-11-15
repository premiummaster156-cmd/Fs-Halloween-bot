const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { Pool } = require("pg");
const { migrate } = require("../src/database/migrate");

const databaseUrl = process.env.TEST_DATABASE_URL || "";

test("real PostgreSQL validates the legacy schema bootstrap, versioned migrations, idempotence and rollback", {
  skip: !databaseUrl
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const schemaName = "fuki_test_" + randomBytes(8).toString("hex");
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "fukishokai-pg-migrations-"));
  const migrationDirectory = path.join(tempDirectory, "migrations");
  fs.mkdirSync(migrationDirectory);

  const transactionFn = async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query('SET LOCAL search_path TO "' + schemaName + '"');
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  const options = { databaseUrl, migrationDirectory, transactionFn };

  try {
    await pool.query('CREATE SCHEMA "' + schemaName + '"');

    const migrationPath = path.join(migrationDirectory, "0001_create_migration_probe.sql");
    fs.writeFileSync(migrationPath, "CREATE TABLE migration_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL);");

    await migrate(options);
    await migrate(options);

    const schemaTables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
      [schemaName]
    );
    const names = new Set(schemaTables.rows.map((row) => row.table_name));
    for (const table of ["players", "weekly_activity", "daily_chat_rewards", "custom_commands", "schema_migrations", "migration_probe"]) {
      assert.equal(names.has(table), true, "expected PostgreSQL table " + table + " to exist");
    }

    const constraint = await pool.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass AND conname = 'players_level_600_check'",
      [schemaName + ".players"]
    );
    assert.equal(constraint.rowCount, 1, "the level cap constraint must be present");

    const checksum = await pool.query(
      'SELECT checksum FROM "' + schemaName + '".schema_migrations WHERE migration_name = $1',
      ["0001_create_migration_probe.sql"]
    );
    assert.equal(checksum.rowCount, 1);

    const failingPath = path.join(migrationDirectory, "0002_fail_transaction.sql");
    fs.writeFileSync(failingPath, "ALTER TABLE migration_probe ADD COLUMN value TEXT;");
    await assert.rejects(migrate(options), /already exists/i);

    const failedLedger = await pool.query(
      'SELECT 1 FROM "' + schemaName + '".schema_migrations WHERE migration_name = $1',
      ["0002_fail_transaction.sql"]
    );
    assert.equal(failedLedger.rowCount, 0, "failed DDL and its migration ledger entry must roll back together");

    fs.rmSync(failingPath);
    fs.writeFileSync(migrationPath, "CREATE TABLE migration_probe_changed (id INTEGER PRIMARY KEY);");
    await assert.rejects(migrate(options), /was modified/);

    const changedTable = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'migration_probe_changed'",
      [schemaName]
    );
    assert.equal(changedTable.rowCount, 0, "edited applied migration must not execute");
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS "' + schemaName + '" CASCADE').catch(() => {});
    await pool.end();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
