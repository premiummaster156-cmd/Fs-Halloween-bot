require("dotenv").config();

const { REST } = require("discord.js");
const settings = require("../src/config/settings");
const { pool } = require("../src/database/pool");

const CONFIRMATION = "RESET_ALL_PLAYER_DATA";
const RESET_TABLES = Object.freeze([
  "heist_participants", "heists", "event_claims", "event_quest_progress", "event_wallets",
  "weekly_quest_claims", "weekly_quest_progress", "weekly_activity", "daily_chat_rewards",
  "equipped_items", "inventory", "boss_battles", "achievement_claims", "party_game_stats",
  "cooldowns", "economy_ledger", "players", "archived_guild_boss_claims",
  "archived_guild_boss_contributions", "archived_guild_bosses", "guild_boss_claims",
  "guild_boss_contributions", "guild_bosses"
]);

// These are operational/configuration records. Inventory is reset, but boost-event
// deduplication must survive so historic Discord boost messages cannot re-grant items.
const PRESERVED_TABLES = Object.freeze([
  "guild_settings", "halloween_events", "custom_commands", "audit_logs",
  "security_incidents", "bot_user_restrictions", "leaderboard_exclusions",
  "application_migrations", "server_booster_status", "server_boost_events"
]);
const MEMBER_ID_COLUMNS = Object.freeze([
  "user_id", "member_id", "player_id", "contributor_id", "claimed_by", "leader_id"
]);

function quotePublicTable(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new TypeError("Invalid internal table name: " + name);
  return 'public."' + name + '"';
}
function quoteColumn(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new TypeError("Invalid internal column name: " + name);
  return '"' + name + '"';
}
async function getExistingTables(client) {
  const result = await client.query(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
    [RESET_TABLES]
  );
  const existing = new Set(result.rows.map((row) => row.tablename));
  return RESET_TABLES.filter((name) => existing.has(name));
}
async function getTableColumns(client, tables) {
  if (!tables.length) return new Map();
  const result = await client.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
    [tables]
  );
  const columns = new Map(tables.map((table) => [table, new Set()]));
  for (const row of result.rows) columns.get(row.table_name)?.add(row.column_name);
  return columns;
}
function getIdentityColumns(table, columns) {
  if (!columns?.has("guild_id")) return [];
  return MEMBER_ID_COLUMNS.filter((column) => columns.has(column));
}
async function getPlayerIdentities(client, tables, columns) {
  const selects = [];
  for (const table of tables) {
    for (const column of getIdentityColumns(table, columns.get(table))) {
      selects.push(
        "SELECT DISTINCT " + quoteColumn("guild_id") + "::text AS guild_id, " +
        quoteColumn(column) + "::text AS user_id FROM " + quotePublicTable(table) +
        " WHERE " + quoteColumn("guild_id") + " IS NOT NULL AND " + quoteColumn(column) + " IS NOT NULL"
      );
    }
  }
  if (!selects.length) return [];
  const result = await client.query(selects.join(" UNION "));
  const unique = new Map();
  for (const row of result.rows) {
    if (!row.guild_id || !row.user_id) continue;
    unique.set(String(row.guild_id) + ":" + String(row.user_id), {
      guild_id: String(row.guild_id), user_id: String(row.user_id)
    });
  }
  return Array.from(unique.values());
}
function readAdminRoleId(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return first ? first.trim() : null;
  }
  return null;
}
async function tableExists(client, table) {
  const result = await client.query(
    "SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = $1",
    [table]
  );
  return result.rowCount > 0;
}
async function getConfiguredAdminRoles(client, guildIds, hasGuildSettings, fallbackRoleId) {
  const roles = new Map();
  if (hasGuildSettings && guildIds.length) {
    const result = await client.query(
      "SELECT guild_id, setting_value FROM public.guild_settings WHERE setting_key = 'adminRoleId' AND guild_id = ANY($1::text[])",
      [guildIds]
    );
    for (const row of result.rows) roles.set(String(row.guild_id), readAdminRoleId(row.setting_value));
  }
  for (const guildId of guildIds) {
    if (!roles.has(guildId)) roles.set(guildId, readAdminRoleId(fallbackRoleId));
  }
  return roles;
}
function discordErrorCode(error) {
  return Number(error?.code ?? error?.rawError?.code ?? error?.data?.code);
}
async function resolveProtectedUsers(client, identities, {
  rest, botOwnerId = settings.ownerId, fallbackAdminRoleId = settings.adminRoleIds[0] || null
} = {}) {
  const guildIds = Array.from(new Set(identities.map((row) => row.guild_id)));
  const protectedUsers = new Map();
  const reasons = new Map();
  const protect = (guildId, userId, reason) => {
    if (!guildId || !userId) return;
    const key = guildId + ":" + userId;
    protectedUsers.set(key, { guild_id: String(guildId), user_id: String(userId) });
    if (!reasons.has(key)) reasons.set(key, new Set());
    reasons.get(key).add(reason);
  };

  for (const guildId of guildIds) {
    if (botOwnerId && identities.some((row) => row.guild_id === guildId && row.user_id === botOwnerId)) {
      protect(guildId, botOwnerId, "bot owner");
    }
  }
  if (guildIds.length && (!rest || typeof rest.get !== "function")) {
    throw new Error("Discord REST access is required to verify server owners and Admin Role members. Set DISCORD_TOKEN before running the reset.");
  }

  const hasGuildSettings = await tableExists(client, "guild_settings");
  const roles = await getConfiguredAdminRoles(client, guildIds, hasGuildSettings, fallbackAdminRoleId);
  for (const guildId of guildIds) {
    let guild;
    try {
      guild = await rest.get("/guilds/" + encodeURIComponent(guildId));
    } catch (error) {
      throw new Error("Could not verify server owner for guild " + guildId + " (Discord API " +
        (discordErrorCode(error) || error.message) + "). No player data was reset.");
    }
    if (!guild?.owner_id) throw new Error("Discord did not return an owner_id for guild " + guildId + ". No player data was reset.");
    const ownerId = String(guild.owner_id);
    if (identities.some((row) => row.guild_id === guildId && row.user_id === ownerId)) {
      protect(guildId, ownerId, "server owner");
    }

    const adminRoleId = roles.get(guildId);
    if (!adminRoleId) continue;
    const candidates = identities.filter((row) =>
      row.guild_id === guildId && !protectedUsers.has(guildId + ":" + row.user_id)
    );
    for (const row of candidates) {
      let member;
      try {
        member = await rest.get("/guilds/" + encodeURIComponent(guildId) +
          "/members/" + encodeURIComponent(row.user_id));
      } catch (error) {
        if (discordErrorCode(error) === 10007) continue; // User has left this guild.
        throw new Error("Could not verify Admin Role membership for user " + row.user_id +
          " in guild " + guildId + " (Discord API " +
          (discordErrorCode(error) || error.message) + "). No player data was reset.");
      }
      const memberRoles = Array.isArray(member?.roles) ? member.roles.map(String) : [];
      if (memberRoles.includes(adminRoleId)) protect(guildId, row.user_id, "configured Admin Role");
    }
  }
  return {
    users: Array.from(protectedUsers.values()),
    reasons: Array.from(reasons.entries()).map(([key, values]) => ({ key, reasons: Array.from(values) }))
  };
}
async function createProtectedUserTable(client, users) {
  await client.query(
    "CREATE TEMP TABLE reset_protected_users (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (guild_id, user_id)) ON COMMIT DROP"
  );
  const chunkSize = 500;
  for (let offset = 0; offset < users.length; offset += chunkSize) {
    const chunk = users.slice(offset, offset + chunkSize);
    const values = [];
    const tuples = chunk.map((user, index) => {
      values.push(user.guild_id, user.user_id);
      const n = index * 2 + 1;
      return "($" + n + ", $" + (n + 1) + ")";
    });
    if (tuples.length) {
      await client.query(
        "INSERT INTO pg_temp.reset_protected_users (guild_id, user_id) VALUES " +
        tuples.join(", ") + " ON CONFLICT DO NOTHING", values
      );
    }
  }
}
function isProtectedPredicate(alias, identityColumn) {
  return "NOT EXISTS (SELECT 1 FROM pg_temp.reset_protected_users protected " +
    "WHERE protected.guild_id = " + alias + ".guild_id::text " +
    "AND protected.user_id = " + alias + "." + quoteColumn(identityColumn) + "::text)";
}
function getDeletePlan(table, columns, existingTables) {
  const tableColumns = columns.get(table) || new Set();
  if (!tableColumns.has("guild_id")) return null;

  if (table === "heists" && tableColumns.has("leader_id")) {
    const leaderNotProtected = isProtectedPredicate("target", "leader_id");
    const participantNotProtected = existingTables.includes("heist_participants")
      ? "NOT EXISTS (SELECT 1 FROM public.heist_participants hp " +
        "JOIN pg_temp.reset_protected_users protected ON protected.guild_id = hp.guild_id::text " +
        "AND protected.user_id = hp.user_id::text WHERE hp.heist_id = target.id)"
      : "TRUE";
    return {
      table, identityColumn: "leader_id / protected participant",
      countSql: "SELECT COUNT(*)::bigint AS count FROM " + quotePublicTable(table) +
        " target WHERE " + leaderNotProtected + " AND " + participantNotProtected,
      deleteSql: "DELETE FROM " + quotePublicTable(table) +
        " AS target WHERE " + leaderNotProtected + " AND " + participantNotProtected
    };
  }

  const identityColumn = getIdentityColumns(table, tableColumns).find((column) => column !== "leader_id");
  if (!identityColumn) return null;
  const predicate = isProtectedPredicate("target", identityColumn);
  return {
    table, identityColumn,
    countSql: "SELECT COUNT(*)::bigint AS count FROM " + quotePublicTable(table) + " target WHERE " + predicate,
    deleteSql: "DELETE FROM " + quotePublicTable(table) + " AS target WHERE " + predicate
  };
}
async function buildDeletePlans(client, tables) {
  const columns = await getTableColumns(client, tables);
  const plans = tables.map((table) => getDeletePlan(table, columns, tables)).filter(Boolean);
  const skippedTables = tables.filter((table) => !getDeletePlan(table, columns, tables));
  return { columns, plans, skippedTables };
}
async function getCounts(client, plans) {
  const counts = {};
  for (const plan of plans) {
    const result = await client.query(plan.countSql);
    counts[plan.table] = Number(result.rows[0]?.count || 0);
  }
  return counts;
}
function writeSummary(logger, { database, plans, counts, protectedUsers, performed, skippedTables }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  logger.log("");
  logger.log(performed ? "[reset] PLAYER DATA RESET COMPLETE" : "[reset] DRY RUN — NOTHING WAS DELETED");
  logger.log("Database: " + database);
  logger.log("Protected accounts: " + protectedUsers.length);
  logger.log("Eligible rows " + (performed ? "deleted" : "marked for deletion") + ": " + total.toLocaleString());
  logger.log("");
  logger.log("Player/game tables:");
  for (const plan of plans) {
    logger.log("  - " + plan.table + " (" + plan.identityColumn + "): " +
      (counts[plan.table] || 0).toLocaleString() + " rows");
  }
  if (skippedTables.length) logger.log("Skipped tables without recognized guild/member identity: " + skippedTables.join(", "));
  logger.log("");
  logger.log("Preserved admin/configuration and Discord boost-tracking tables:");
  for (const table of PRESERVED_TABLES) logger.log("  - " + table);
  if (!performed) {
    logger.log("");
    logger.log("No changes have been made.");
    logger.log("Stop the bot, back up Neon, review this preview, then run:");
    logger.log("  npm run reset:player-data -- --confirm " + CONFIRMATION);
  }
  logger.log("");
}
async function runReset({
  dbPool = pool, confirm = false, logger = console, rest,
  botOwnerId = settings.ownerId, fallbackAdminRoleId = settings.adminRoleIds[0] || null
} = {}) {
  const client = await dbPool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SET LOCAL lock_timeout = '15s'");
    const dbResult = await client.query("SELECT current_database() AS database, current_schema() AS schema");
    const database = dbResult.rows[0]?.database || "unknown";
    const schema = dbResult.rows[0]?.schema || "unknown";
    const tables = await getExistingTables(client);
    if (!tables.includes("players")) throw new Error("The public.players table was not found. Run npm run db:migrate first.");

    // Lock early: no player rows or related progress can change while protection is resolved.
    if (confirm) await client.query("LOCK TABLE " + tables.map(quotePublicTable).join(", ") + " IN ACCESS EXCLUSIVE MODE");

    const { columns, plans, skippedTables } = await buildDeletePlans(client, tables);
    const identities = await getPlayerIdentities(client, tables, columns);
    const protection = await resolveProtectedUsers(client, identities, { rest, botOwnerId, fallbackAdminRoleId });
    await createProtectedUserTable(client, protection.users);
    const counts = await getCounts(client, plans);

    if (!confirm) {
      await client.query("COMMIT");
      inTransaction = false;
      writeSummary(logger, {
        database: database + " / " + schema, plans, counts,
        protectedUsers: protection.users, performed: false, skippedTables
      });
      return {
        performed: false, database, schema, tables, plans, counts,
        protectedUsers: protection.users, protectionReasons: protection.reasons, skippedTables
      };
    }

    for (const plan of plans) await client.query(plan.deleteSql);
    await client.query("COMMIT");
    inTransaction = false;
    writeSummary(logger, {
      database: database + " / " + schema, plans, counts,
      protectedUsers: protection.users, performed: true, skippedTables
    });
    return {
      performed: true, database, schema, tables, plans, counts,
      protectedUsers: protection.users, protectionReasons: protection.reasons, skippedTables
    };
  } catch (error) {
    if (inTransaction) {
      try { await client.query("ROLLBACK"); }
      catch (rollbackError) { logger.error("[reset] Rollback also failed:", rollbackError.message); }
    }
    throw error;
  } finally {
    client.release();
  }
}
function parseConfirmation(argv) {
  if (argv.length === 0) return false;
  if (argv.length === 2 && argv[0] === "--confirm" && argv[1] === CONFIRMATION) return true;
  throw new Error("Invalid arguments. Preview with npm run reset:player-data or execute with " +
    "npm run reset:player-data -- --confirm " + CONFIRMATION + ".");
}
async function main(argv = process.argv.slice(2)) {
  if (!settings.databaseUrl) throw new Error("DATABASE_URL is missing. Configure Neon PostgreSQL first.");
  if (!settings.discordToken) throw new Error("DISCORD_TOKEN is required to verify guild owners and configured Admin Role members. No player data was reset.");
  if (!settings.ownerId) throw new Error("OWNER_ID is required so the bot owner's player data can be protected. No player data was reset.");
  const confirm = parseConfirmation(argv);
  const rest = new REST({ version: "10" }).setToken(settings.discordToken);
  await runReset({ confirm, rest, botOwnerId: settings.ownerId });
}
if (require.main === module) {
  main().catch((error) => {
    console.error("[reset] FAILED:", error.message);
    process.exitCode = 1;
  }).finally(() => pool.end());
}

module.exports = {
  CONFIRMATION, RESET_TABLES, PRESERVED_TABLES, MEMBER_ID_COLUMNS,
  quotePublicTable, getExistingTables, getTableColumns, getPlayerIdentities,
  getConfiguredAdminRoles, resolveProtectedUsers, createProtectedUserTable,
  getDeletePlan, buildDeletePlans, getCounts, runReset, parseConfirmation
};
