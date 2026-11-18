"use strict";

require("dotenv").config();

const { Client, Events, GatewayIntentBits } = require("discord.js");
const settings = require("../src/config/settings");
const { pool, coopftPool } = require("../src/database/pool");
const { migrateCoopFT } = require("../src/database/migrate");
const { moveCoopFTGuildData } = require("../src/database/move-coopft-guild-data");
const { CoopFTCommunityService } = require("../src/services/coopft-community");
const { COOPFT_DEFAULT_GUILD_ID, coopftGuildId } = require("../src/config/server-personas");

function waitForClientReady(client) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      client.off(Events.ClientReady, onReady);
      client.off("error", onError);
    };
    const onReady = (readyClient) => {
      cleanup();
      resolve(readyClient);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    client.once(Events.ClientReady, onReady);
    client.once("error", onError);
  });
}

async function runCoopFTSetup(options = {}) {
  const token = options.token ?? settings.discordToken;
  const guildId = String(options.guildId ?? coopftGuildId).trim();
  const databasePool = options.databasePool || coopftPool;
  const sourcePool = options.sourcePool || (options.databasePool ? null : pool);
  const migrateDatabase = options.migrateDatabase || (() => migrateCoopFT({ pool: databasePool }));
  const transferDatabase = options.transferDatabase || (sourcePool
    ? () => moveCoopFTGuildData({ sourcePool, destinationPool: databasePool, guildId, sourceUrl: settings.databaseUrl, destinationUrl: settings.coopftDatabaseUrl })
    : null);
  const createClient = options.clientFactory || (() => new Client({
    // The approved GuildMembers intent is required to build the live staff directory
    // from actual member role assignments during setup.
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
  }));
  const createService = options.serviceFactory ||
    ((pg, configuredGuildId) => new CoopFTCommunityService(pg, { guildId: configuredGuildId }));
  const logger = options.logger || console;
  const closePool = options.closePool !== false;

  if (!token) throw new Error("DISCORD_TOKEN is missing.");
  if (!databasePool) throw new Error("COOPFT_DATABASE_URL is missing. Create a separate CoopFT Neon project and configure its connection string first.");
  if (!/^[0-9]{17,20}$/.test(guildId)) {
    throw new Error("COOPFT_GUILD_ID must be a valid Discord server ID.");
  }
  const testOnlyAllowGuildIdOverride = options.testOnlyAllowGuildIdOverride === true;
  if (guildId !== COOPFT_DEFAULT_GUILD_ID && !testOnlyAllowGuildIdOverride) {
    throw new Error(
      "Safety lock: CoopFT setup is allowed only for server " +
      COOPFT_DEFAULT_GUILD_ID + ". Refusing to run against " + guildId + "."
    );
  }
  if (coopftGuildId !== COOPFT_DEFAULT_GUILD_ID && !testOnlyAllowGuildIdOverride) {
    throw new Error("Safety lock: the configured CoopFT persona does not match its verified server ID.");
  }

  let client = null;
  let primaryError = null;
  try {
    logger.info("[coopft-setup] Applying database schema and migrations...");
    await migrateDatabase();
    if (transferDatabase) {
      const transfer = await transferDatabase();
      logger.info("[coopft-setup] Dedicated CoopFT database transfer:", transfer);
    }

    client = createClient();
    const readyPromise = waitForClientReady(client);
    await client.login(token);
    const readyClient = await readyPromise;

    logger.info("[coopft-setup] Connected. Fetching CoopFT server " + guildId + "...");
    const guild = await readyClient.guilds.fetch(guildId);
    if (!guild || guild.id !== guildId) {
      throw new Error("The configured CoopFT server could not be fetched. Check the bot invite and COOPFT_GUILD_ID.");
    }

    const service = createService(databasePool, guildId);
    logger.info("[coopft-setup] Creating or repairing CoopFT channels, roles, panels and directories...");
    const result = await service.bootstrap(guild, { source: "hosting-console" });

    logger.info(
      "[coopft-setup] Complete for " + guild.name + " (" + guild.id + "). " +
      "Created " + result.createdRoles + " roles, " +
      result.createdChannels + " channels and " +
      result.createdEmojis + " emojis."
    );
    if (result.cleanup?.awaitingConfirmation) {
      logger.warn(
        "[coopft-setup] Role cleanup is preview-only: " +
        result.cleanup.candidates.length + " editable roles were listed; none were deleted."
      );
    }
    if (result.emojiResult?.failed?.length) {
      logger.warn("[coopft-setup] Some custom emojis used Unicode fallbacks.");
    }
    return { guildId, ...result };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (client) {
      try {
        client.destroy();
      } catch (error) {
        logger.warn("[coopft-setup] Discord client cleanup failed:", error.message);
      }
    }
    if (closePool) {
      try {
        await databasePool.end();
      } catch (error) {
        if (primaryError) {
          logger.warn("[coopft-setup] Database pool cleanup also failed:", error.message);
        } else {
          throw error;
        }
      }
    }
  }
}

if (require.main === module) {
  runCoopFTSetup().catch((error) => {
    console.error("[coopft-setup] Failed:", error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { runCoopFTSetup, waitForClientReady };
