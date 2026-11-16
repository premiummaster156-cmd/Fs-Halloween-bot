"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { migrate, migrateCoopFT, checksum, readVersionedMigrations } = require("../src/database/migrate");

function createFixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fukishokai-migrations-"));
  const migrationDirectory = path.join(directory, "migrations");
  fs.mkdirSync(migrationDirectory);
  const schemaPath = path.join(directory, "schema.sql");
  const schemaSql = options.schemaSql || "CREATE TABLE test_schema (id INTEGER);";
  fs.writeFileSync(schemaPath, schemaSql);

  for (const [name, sql] of Object.entries(options.files || {})) {
    fs.writeFileSync(path.join(migrationDirectory, name), sql);
  }

  const checksums = new Map(Object.entries(options.initialChecksums || {}));
  const statements = [];
  const queries = [];
  const constraints = options.hasLevelConstraint ? [{ conname: "players_level_600_check" }] : [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      const normalized = String(sql).trim();
      if (normalized.startsWith("SELECT checksum FROM schema_migrations")) {
        const value = checksums.get(params[0]);
        return { rows: value ? [{ checksum: value }] : [] };
      }
      if (normalized.startsWith("INSERT INTO schema_migrations")) {
        checksums.set(params[0], params[1]);
        return { rows: [] };
      }
      if (normalized.startsWith("SELECT conname FROM pg_constraint")) {
        return { rows: constraints };
      }
      if (normalized === schemaSql || Object.values(options.files || {}).includes(sql)) {
        if (options.failOnSql === sql) throw new Error("simulated SQL failure");
        statements.push(sql);
        return { rows: [] };
      }
      if (normalized.startsWith("ALTER TABLE players ADD CONSTRAINT")) {
        statements.push(normalized);
        return { rows: [] };
      }
      return { rows: [] };
    }
  };

  const transactionFn = async (callback) => {
    const previousChecksums = new Map(checksums);
    const previousStatementsLength = statements.length;
    try {
      return await callback(client);
    } catch (error) {
      checksums.clear();
      for (const [name, value] of previousChecksums) checksums.set(name, value);
      statements.length = previousStatementsLength;
      throw error;
    }
  };

  return {
    directory, migrationDirectory, schemaPath, schemaSql,
    checksums, statements, queries, transactionFn,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true })
  };
}

test("versioned migrations run in numeric filename order under the advisory lock", async () => {
  const fixture = createFixture({
    files: {
      "0002_add_second_table.sql": "CREATE TABLE second_table (id INTEGER);",
      "0001_add_first_table.sql": "CREATE TABLE first_table (id INTEGER);"
    },
    hasLevelConstraint: true
  });
  try {
    fixture.checksums.set("schema.sql", checksum(fixture.schemaSql));
    await migrate({
      databaseUrl: "postgresql://test.invalid/db",
      schemaPath: fixture.schemaPath,
      migrationDirectory: fixture.migrationDirectory,
      transactionFn: fixture.transactionFn
    });

    assert.deepEqual(fixture.statements, [
      "CREATE TABLE first_table (id INTEGER);",
      "CREATE TABLE second_table (id INTEGER);"
    ]);
    assert.equal(fixture.checksums.get("0001_add_first_table.sql"), checksum("CREATE TABLE first_table (id INTEGER);"));
    assert.equal(fixture.checksums.get("0002_add_second_table.sql"), checksum("CREATE TABLE second_table (id INTEGER);"));
    assert.match(fixture.queries[0].sql, /pg_advisory_xact_lock/);
  } finally {
    fixture.cleanup();
  }
});

test("CoopFT setup migrations apply only CoopFT tables and skip the global player schema", async () => {
  const fixture = createFixture({
    files: {
      "0001_coopft_community.sql": "CREATE TABLE coopft_community_settings (guild_id TEXT);",
      "0002_coopft_applications.sql": "CREATE TABLE coopft_applications (id UUID);",
      "0003_coopft_application_notifications.sql": "CREATE TABLE coopft_application_subscriptions (guild_id TEXT);",
      "0004_coopft_staff_applications.sql": "ALTER TABLE coopft_applications DROP CONSTRAINT IF EXISTS coopft_applications_role_key_check; DROP TABLE IF EXISTS coopft_application_subscriptions;",
      "0005_add_player_economy_column.sql": "ALTER TABLE players ADD COLUMN should_not_run BOOLEAN;"
    }
  });
  try {
    await migrateCoopFT({
      databaseUrl: "postgresql://test.invalid/db",
      // This file deliberately does not exist: the isolated path must not load schema.sql.
      schemaPath: path.join(fixture.directory, "must-not-read-schema.sql"),
      migrationDirectory: fixture.migrationDirectory,
      transactionFn: fixture.transactionFn
    });
    assert.deepEqual(fixture.statements, [
      "CREATE TABLE coopft_community_settings (guild_id TEXT);",
      "CREATE TABLE coopft_applications (id UUID);",
      "CREATE TABLE coopft_application_subscriptions (guild_id TEXT);",
      "ALTER TABLE coopft_applications DROP CONSTRAINT IF EXISTS coopft_applications_role_key_check; DROP TABLE IF EXISTS coopft_application_subscriptions;"
    ]);
    assert.equal(fixture.checksums.has("schema.sql"), false);
    assert.equal(fixture.checksums.has("0005_add_player_economy_column.sql"), false);
    assert.equal(
      fixture.queries.some((query) => /players|player_economy/.test(query.sql)),
      false,
      "CoopFT-only migration mode must not query or alter Fukishokai player tables"
    );
  } finally {
    fixture.cleanup();
  }
});

test("an already-applied migration with the same checksum is skipped", async () => {
  const sql = "ALTER TABLE players ADD COLUMN test_flag BOOLEAN NOT NULL DEFAULT FALSE;";
  const fixture = createFixture({
    files: { "0001_add_test_flag.sql": sql },
    hasLevelConstraint: true
  });
  try {
    fixture.checksums.set("schema.sql", checksum(fixture.schemaSql));
    fixture.checksums.set("0001_add_test_flag.sql", checksum(sql));
    await migrate({
      databaseUrl: "postgresql://test.invalid/db",
      schemaPath: fixture.schemaPath,
      migrationDirectory: fixture.migrationDirectory,
      transactionFn: fixture.transactionFn
    });
    assert.deepEqual(fixture.statements, []);
  } finally {
    fixture.cleanup();
  }
});

test("editing an applied migration fails closed and leaves the ledger unchanged", async () => {
  const oldSql = "ALTER TABLE players ADD COLUMN old_flag BOOLEAN;";
  const newSql = "ALTER TABLE players ADD COLUMN changed_flag BOOLEAN;";
  const fixture = createFixture({
    files: { "0001_add_flag.sql": newSql },
    initialChecksums: { "0001_add_flag.sql": checksum(oldSql) },
    hasLevelConstraint: true
  });
  try {
    fixture.checksums.set("schema.sql", checksum(fixture.schemaSql));
    await assert.rejects(
      migrate({
        databaseUrl: "postgresql://test.invalid/db",
        schemaPath: fixture.schemaPath,
        migrationDirectory: fixture.migrationDirectory,
        transactionFn: fixture.transactionFn
      }),
      /was modified/
    );
    assert.equal(fixture.checksums.get("0001_add_flag.sql"), checksum(oldSql));
    assert.deepEqual(fixture.statements, []);
  } finally {
    fixture.cleanup();
  }
});


test("a failed migration SQL statement rolls back its migration ledger entry", async () => {
  const sql = "ALTER TABLE players ADD COLUMN failure_test BOOLEAN;";
  const fixture = createFixture({
    files: { "0001_failure_test.sql": sql },
    failOnSql: sql,
    hasLevelConstraint: true
  });
  try {
    fixture.checksums.set("schema.sql", checksum(fixture.schemaSql));
    await assert.rejects(
      migrate({
        databaseUrl: "postgresql://test.invalid/db",
        schemaPath: fixture.schemaPath,
        migrationDirectory: fixture.migrationDirectory,
        transactionFn: fixture.transactionFn
      }),
      /simulated SQL failure/
    );
    assert.equal(fixture.checksums.has("0001_failure_test.sql"), false);
    assert.deepEqual(fixture.statements, []);
  } finally {
    fixture.cleanup();
  }
});

test("missing DATABASE_URL prevents migration work from starting", async () => {
  let transactionStarted = false;
  await assert.rejects(
    migrate({
      databaseUrl: "",
      transactionFn: async () => { transactionStarted = true; }
    }),
    /DATABASE_URL is missing/
  );
  assert.equal(transactionStarted, false);
});

test("migration files require a unique four-digit version and non-empty SQL", () => {
  const fixture = createFixture({
    files: {
      "0001_first.sql": "SELECT 1;",
      "0001_second.sql": "SELECT 2;"
    }
  });
  try {
    assert.throws(
      () => readVersionedMigrations(fixture.migrationDirectory),
      /Duplicate database migration version/
    );
    fs.rmSync(path.join(fixture.migrationDirectory, "0001_second.sql"));
    fs.writeFileSync(path.join(fixture.migrationDirectory, "bad-name.sql"), "SELECT 3;");
    assert.throws(
      () => readVersionedMigrations(fixture.migrationDirectory),
      /Invalid migration filename/
    );
    fs.rmSync(path.join(fixture.migrationDirectory, "bad-name.sql"));
    fs.writeFileSync(path.join(fixture.migrationDirectory, "0002_empty.sql"), "  \n");
    assert.throws(
      () => readVersionedMigrations(fixture.migrationDirectory),
      /migration is empty/
    );
  } finally {
    fixture.cleanup();
  }
});
