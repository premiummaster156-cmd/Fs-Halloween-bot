"use strict";

const crypto = require("node:crypto");

const TRANSFER_LOCK_ID = 734921605;
const STATE_TABLE = '"public"."coopft_data_transfer_state"';

// Only CoopFT-owned community records move. Fukishokai game/economy tables are excluded.
const COOPFT_DATA_TABLES = Object.freeze([
  "coopft_community_settings",
  "coopft_staff_members",
  "coopft_staff_audit",
  "coopft_tickets",
  "coopft_applications",
  "coopft_mod_cases",
  "coopft_staff_notes",
  "coopft_suggestions",
  "coopft_ticket_cooldowns",
  "guild_autoroles",
  "guild_welcome_settings",
  "guild_settings",
  "audit_logs"
]);
function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(value))) {
    throw new Error("Unsafe PostgreSQL identifier in CoopFT transfer: " + value);
  }
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function hashRows(rows) {
  return crypto.createHash("sha256").update(rows.join("\n"), "utf8").digest("hex");
}

function connectionHost(connectionString, label) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(label + " must be a valid PostgreSQL connection URL.");
  }
  return parsed.hostname.toLowerCase().replace(/^([^.]+)-pooler\\./, "$1.");
}

async function listGuildTables(client) {
  const result = await client.query(
    "SELECT DISTINCT c.table_name " +
    "FROM information_schema.columns c " +
    "JOIN information_schema.tables t " +
    "ON t.table_schema=c.table_schema AND t.table_name=c.table_name " +
    "WHERE c.table_schema='public' AND c.column_name='guild_id' " +
    "AND t.table_type='BASE TABLE' AND c.table_name = ANY($1::text[])",
    [COOPFT_DATA_TABLES]
  );
  return result.rows.map((row) => row.table_name);
}

async function getColumns(client, tableName) {
  const result = await client.query(
    "SELECT column_name, udt_name, is_identity, is_generated, column_default " +
    "FROM information_schema.columns " +
    "WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
    [tableName]
  );
  return result.rows;
}

function compareColumns(sourceColumns, destinationColumns, tableName) {
  const shape = (columns) => columns.map((column) => [
    column.column_name,
    column.udt_name,
    column.is_identity,
    column.is_generated
  ]);
  if (JSON.stringify(shape(sourceColumns)) !== JSON.stringify(shape(destinationColumns))) {
    throw new Error(
      "Schema mismatch for public." + tableName +
      ". Source and CoopFT databases must run the same application migrations before data is moved."
    );
  }
}

async function fetchGuildRows(client, tableName, guildId) {
  const table = '"public".' + quoteIdentifier(tableName);
  const result = await client.query(
    "SELECT to_jsonb(row_data)::text AS row_json " +
    "FROM " + table + " AS row_data " +
    "WHERE row_data.guild_id=$1 " +
    "ORDER BY to_jsonb(row_data)::text",
    [guildId]
  );
  return result.rows.map((row) => row.row_json);
}

async function insertRows(client, tableName, columns, rowJson) {
  if (!rowJson.length) return;
  const writableColumns = columns.filter((column) => column.is_generated !== "ALWAYS");
  const names = writableColumns.map((column) => quoteIdentifier(column.column_name));
  const identityAlways = writableColumns.some((column) => column.is_identity === "YES");
  const table = '"public".' + quoteIdentifier(tableName);
  const records = "[" + rowJson.join(",") + "]";
  const selectedValues = writableColumns.map((column) => {
    const name = quoteIdentifier(column.column_name);
    // Older Fukishōkai copies may contain SQL NULL in this JSONB setting field,
    // even though the dedicated CoopFT schema correctly requires NOT NULL.
    // Preserve the legacy null as JSONB null so the destination constraint is met
    // without inventing a setting value; the JSON row/hash remains unchanged.
    if (tableName === "coopft_community_settings" && column.column_name === "setting_value") {
      return "COALESCE(source_rows." + name + ", 'null'::jsonb)";
    }
    return "source_rows." + name;
  });
  const sql =
    "INSERT INTO " + table + " (" + names.join(",") + ") " +
    (identityAlways ? "OVERRIDING SYSTEM VALUE " : "") +
    "SELECT " + selectedValues.join(",") +
    " FROM json_populate_recordset(NULL::" + table + ", $1::json) AS source_rows " +
    "ON CONFLICT DO NOTHING";
  await client.query(sql, [records]);
}

async function syncSequences(client, tableName, columns) {
  const table = '"public".' + quoteIdentifier(tableName);
  for (const column of columns) {
    if (!String(column.column_default || "").includes("nextval(")) continue;
    const sequenceResult = await client.query(
      "SELECT pg_get_serial_sequence($1, $2) AS sequence_name",
      ["public." + tableName, column.column_name]
    );
    const sequenceName = sequenceResult.rows[0]?.sequence_name;
    if (!sequenceName) continue;
    const columnName = quoteIdentifier(column.column_name);
    await client.query(
      "SELECT setval($1::regclass, COALESCE(MAX(" + columnName + "), 1), COUNT(*) > 0) FROM " + table,
      [sequenceName]
    );
  }
}

async function ensureTransferStateTable(client) {
  await client.query(
    "CREATE TABLE IF NOT EXISTS " + STATE_TABLE + " (" +
    "guild_id TEXT PRIMARY KEY, " +
    "source_host TEXT NOT NULL, " +
    "status TEXT NOT NULL CHECK (status IN ('verified','complete')), " +
    "manifest JSONB NOT NULL DEFAULT '{}'::jsonb, " +
    "verified_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, " +
    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
  );
}

async function readState(client, guildId) {
  const result = await client.query(
    "SELECT source_host,status,manifest FROM " + STATE_TABLE + " WHERE guild_id=$1",
    [guildId]
  );
  return result.rows[0] || null;
}

async function verifyManifest(destinationClient, manifest, guildId) {
  for (const [tableName, expected] of Object.entries(manifest || {})) {
    const rows = await fetchGuildRows(destinationClient, tableName, guildId);
    if (rows.length !== Number(expected.count) || hashRows(rows) !== expected.sha256) {
      throw new Error(
        "CoopFT destination verification failed for public." + tableName +
        ". Source data will not be deleted."
      );
    }
  }
}

async function countSourceRows(sourceClient, tables, guildId) {
  let count = 0;
  for (const tableName of tables) {
    const table = '"public".' + quoteIdentifier(tableName);
    const result = await sourceClient.query(
      "SELECT COUNT(*)::bigint AS count FROM " + table + " WHERE guild_id=$1",
      [guildId]
    );
    count += Number(result.rows[0]?.count || 0);
  }
  return count;
}

async function deleteSourceRows(sourceClient, tables, guildId) {
  await sourceClient.query("BEGIN");
  try {
    // Delete only CoopFT guild rows. Other guild data in the shared source database is untouched.
    for (const tableName of [...tables].reverse()) {
      const table = '"public".' + quoteIdentifier(tableName);
      await sourceClient.query("DELETE FROM " + table + " WHERE guild_id=$1", [guildId]);
    }
    await sourceClient.query("COMMIT");
  } catch (error) {
    await sourceClient.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function moveCoopFTGuildData(options = {}) {
  const sourcePool = options.sourcePool;
  const destinationPool = options.destinationPool;
  const guildId = String(options.guildId || "");
  const sourceUrl = options.sourceUrl || "";
  const destinationUrl = options.destinationUrl || "";

  if (!sourcePool || !destinationPool) {
    throw new Error("Both the Fukishokai source pool and the dedicated CoopFT destination pool are required.");
  }
  if (!/^\d{17,20}$/.test(guildId)) {
    throw new Error("A verified CoopFT Discord guild ID is required for the data transfer.");
  }
  if (!sourceUrl || !destinationUrl) {
    throw new Error("DATABASE_URL and COOPFT_DATABASE_URL are both required for the CoopFT data transfer.");
  }
  const sourceHost = connectionHost(sourceUrl, "DATABASE_URL");
  const destinationHost = connectionHost(destinationUrl, "COOPFT_DATABASE_URL");
  if (sourceHost === destinationHost) {
    throw new Error("CoopFT data transfer refused: both database URLs point to the same PostgreSQL endpoint.");
  }

  const sourceClient = await sourcePool.connect();
  let destinationClient = null;
  let sourceLocked = false;
  let destinationLocked = false;

  try {
    destinationClient = await destinationPool.connect();
    await sourceClient.query("SELECT pg_advisory_lock($1)", [TRANSFER_LOCK_ID]);
    sourceLocked = true;
    await destinationClient.query("SELECT pg_advisory_lock($1)", [TRANSFER_LOCK_ID]);
    destinationLocked = true;
    await ensureTransferStateTable(destinationClient);

    const sourceTables = new Set(await listGuildTables(sourceClient));
    const destinationTables = new Set(await listGuildTables(destinationClient));
    const missingSourceTables = COOPFT_DATA_TABLES.filter((tableName) => !sourceTables.has(tableName));
    const missingDestinationTables = COOPFT_DATA_TABLES.filter((tableName) => !destinationTables.has(tableName));
    if (missingSourceTables.length || missingDestinationTables.length) {
      throw new Error(
        "CoopFT schema is not ready. Missing in Fukishokai: " + (missingSourceTables.join(", ") || "none") +
        ". Missing in CoopFT: " + (missingDestinationTables.join(", ") || "none") +
        ". Apply database migrations before moving data."
      );
    }
    const tables = [...COOPFT_DATA_TABLES];

    const state = await readState(destinationClient, guildId);
    if (state?.status === "complete") {
      const remaining = await countSourceRows(sourceClient, tables, guildId);
      if (remaining > 0) {
        throw new Error(
          "CoopFT transfer was already completed, but " + remaining +
          " CoopFT-guild rows have reappeared in the Fukishokai database. Refusing an automatic second deletion."
        );
      }
      return { status: "already-complete", tables: tables.length, rows: 0 };
    }

    let manifest = state?.status === "verified" ? state.manifest : null;
    if (manifest) {
      // Handles a process restart after source deletion but before the destination completion marker.
      await verifyManifest(destinationClient, manifest, guildId);
      const sourceCount = await countSourceRows(sourceClient, tables, guildId);
      if (sourceCount > 0) {
        for (const [tableName, expected] of Object.entries(manifest)) {
          const rows = await fetchGuildRows(sourceClient, tableName, guildId);
          if (rows.length !== Number(expected.count) || hashRows(rows) !== expected.sha256) {
            throw new Error(
              "Fukishokai source changed after the CoopFT copy was verified. " +
              "No source rows were deleted."
            );
          }
        }
      }
    } else {
      manifest = {};
      for (const tableName of tables) {
        const sourceColumns = await getColumns(sourceClient, tableName);
        const destinationColumns = await getColumns(destinationClient, tableName);
        compareColumns(sourceColumns, destinationColumns, tableName);

        const sourceRows = await fetchGuildRows(sourceClient, tableName, guildId);
        const destinationRowsBefore = await fetchGuildRows(destinationClient, tableName, guildId);

        if (sourceRows.length === 0 && destinationRowsBefore.length > 0) {
          throw new Error(
            "The new CoopFT database already has rows for " + guildId +
            " in public." + tableName + " but the Fukishokai source does not. " +
            "Refusing to merge potentially unrelated data."
          );
        }

        if (sourceRows.length) {
          await insertRows(destinationClient, tableName, sourceColumns, sourceRows);
          await syncSequences(destinationClient, tableName, destinationColumns);
        }

        const destinationRows = await fetchGuildRows(destinationClient, tableName, guildId);
        const sourceHash = hashRows(sourceRows);
        const destinationHash = hashRows(destinationRows);
        if (sourceRows.length !== destinationRows.length || sourceHash !== destinationHash) {
          throw new Error(
            "CoopFT data verification failed for public." + tableName +
            ". Fukishokai records have been preserved."
          );
        }
        manifest[tableName] = { count: sourceRows.length, sha256: sourceHash };
      }

      await destinationClient.query(
        "INSERT INTO " + STATE_TABLE + "(guild_id,source_host,status,manifest,verified_at,updated_at) " +
        "VALUES($1,$2,'verified',$3::jsonb,NOW(),NOW()) " +
        "ON CONFLICT(guild_id) DO UPDATE SET source_host=EXCLUDED.source_host,status='verified'," +
        "manifest=EXCLUDED.manifest,verified_at=NOW(),updated_at=NOW()",
        [guildId, sourceHost, JSON.stringify(manifest)]
      );
    }

    const verifiedCount = Object.values(manifest).reduce((sum, table) => sum + Number(table.count || 0), 0);
    const sourceCountBeforeDelete = await countSourceRows(sourceClient, tables, guildId);
    if (sourceCountBeforeDelete > 0) {
      await deleteSourceRows(sourceClient, tables, guildId);
    }
    const remaining = await countSourceRows(sourceClient, tables, guildId);
    if (remaining !== 0) {
      throw new Error(
        "CoopFT destination was verified, but the source still contains " + remaining +
        " matching rows. The transfer remains marked verified for a safe retry."
      );
    }

    await destinationClient.query(
      "UPDATE " + STATE_TABLE + " SET status='complete',completed_at=NOW(),updated_at=NOW() WHERE guild_id=$1",
      [guildId]
    );

    return {
      status: "completed",
      guildId,
      tables: Object.keys(manifest).length,
      rows: verifiedCount,
      sourceHost,
      destinationHost
    };
  } finally {
    if (destinationLocked && destinationClient) {
      await destinationClient.query("SELECT pg_advisory_unlock($1)", [TRANSFER_LOCK_ID]).catch(() => {});
    }
    if (sourceLocked) {
      await sourceClient.query("SELECT pg_advisory_unlock($1)", [TRANSFER_LOCK_ID]).catch(() => {});
    }
    if (destinationClient) destinationClient.release();
    sourceClient.release();
  }
}

module.exports = { moveCoopFTGuildData, listGuildTables, hashRows, insertRows };
