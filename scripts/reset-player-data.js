require("dotenv").config();

const settings = require("../src/config/settings");
const { pool } = require("../src/database/pool");

const CONFIRMATION = "RESET_ALL_PLAYER_DATA";

const RESET_TABLES = Object.freeze([
  "heist_participants",
  "heists",
  "event_claims",
  "event_quest_progress",
  "event_wallets",
  "weekly_quest_claims",
  "weekly_quest_progress",
  "weekly_activity",
  "daily_chat_rewards",
  "equipped_items",
  "inventory",
  "boss_battles",
  "achievement_claims",
  "party_game_stats",
  "cooldowns",
  "economy_ledger",
  "players",
  "archived_guild_boss_claims",
  "archived_guild_boss_contributions",
  "archived_guild_bosses",
  "guild_boss_claims",
  "guild_boss_contributions",
  "guild_bosses",
  "server_boost_events",
  "server_booster_status"
]);

const PRESERVED_TABLES = Object.freeze([
  "guild_settings",
  "halloween_events",
  "custom_commands",
  "audit_logs",
  "security_incidents",
  "bot_user_restrictions",
  "leaderboard_exclusions",
  "application_migrations"
]);

function quotePublicTable(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new TypeError("Invalid internal table name: " + name);
  }
  return 'public."' + name + '"';
}

async function getExistingTables(client) {
  const result = await client.query(
    "SELECT tablename FROM pg_catalog.pg_tables " +
    "WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
    [RESET_TABLES]
  );
  const existing = new Set(result.rows.map((row) => row.tablename));
  return RESET_TABLES.filter((name) => existing.has(name));
}

async function getCounts(client, tables) {
  const counts = {};
  for (const table of tables) {
    const result = await client.query(
      "SELECT COUNT(*)::bigint AS count FROM " + quotePublicTable(table)
    );
    counts[table] = Number(result.rows[0]?.count || 0);
  }
  return counts;
}

function writeSummary(logger, { database, tables, counts, performed }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  logger.log("");
  logger.log(performed ? "[reset] PLAYER DATA RESET COMPLETE" : "[reset] DRY RUN — NOTHING WAS DELETED");
  logger.log("Database: " + database);
  logger.log("Game data tables:");
  for (const table of tables) {
    logger.log("  - " + table + ": " + (counts[table] || 0).toLocaleString() + " rows");
  }
  logger.log("Total rows " + (performed ? "deleted" : "marked for deletion") + ": " + total.toLocaleString());
  logger.log("");
  logger.log("Preserved admin/configuration tables:");
  for (const table of PRESERVED_TABLES) logger.log("  - " + table);
  if (!performed) {
    logger.log("");
    logger.log("No changes have been made.");
    logger.log("To permanently reset all listed player/game data, run:");
    logger.log("  npm run reset:player-data -- --confirm " + CONFIRMATION);
  }
  logger.log("");
}

async function runReset({ dbPool = pool, confirm = false, logger = console } = {}) {
  const client = await dbPool.connect();
  let inTransaction = false;
  try {
    if (confirm) {
      await client.query("BEGIN");
      inTransaction = true;
      await client.query("SET LOCAL lock_timeout = '15s'");
    }

    const dbResult = await client.query(
      "SELECT current_database() AS database, current_schema() AS schema"
    );
    const database = dbResult.rows[0]?.database || "unknown";
    const schema = dbResult.rows[0]?.schema || "unknown";
    const tables = await getExistingTables(client);
    if (!tables.includes("players")) {
      throw new Error("The public.players table was not found. Run npm run db:migrate first.");
    }

    if (confirm) {
      const lockTargets = tables.map(quotePublicTable).join(", ");
      await client.query("LOCK TABLE " + lockTargets + " IN ACCESS EXCLUSIVE MODE");
    }

    const counts = await getCounts(client, tables);
    if (!confirm) {
      writeSummary(logger, { database: database + " / " + schema, tables, counts, performed: false });
      return { performed: false, database, schema, tables, counts };
    }

    for (const table of tables) {
      await client.query("DELETE FROM " + quotePublicTable(table));
    }

    await client.query("COMMIT");
    inTransaction = false;
    writeSummary(logger, { database: database + " / " + schema, tables, counts, performed: true });
    return { performed: true, database, schema, tables, counts };
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logger.error("[reset] Rollback also failed:", rollbackError.message);
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

function parseConfirmation(argv) {
  if (argv.length === 0) return false;
  if (argv.length === 2 && argv[0] === "--confirm" && argv[1] === CONFIRMATION) return true;
  throw new Error(
    "Invalid arguments. Preview with npm run reset:player-data or execute with " +
    "npm run reset:player-data -- --confirm " + CONFIRMATION + "."
  );
}

async function main(argv = process.argv.slice(2)) {
  if (!settings.databaseUrl) {
    throw new Error("DATABASE_URL is missing. Configure the Neon PostgreSQL connection first.");
  }
  const confirm = parseConfirmation(argv);
  await runReset({ confirm });
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("[reset] FAILED:", error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = {
  CONFIRMATION,
  RESET_TABLES,
  PRESERVED_TABLES,
  quotePublicTable,
  getExistingTables,
  getCounts,
  runReset,
  parseConfirmation
};
