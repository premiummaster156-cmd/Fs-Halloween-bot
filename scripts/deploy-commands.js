require("dotenv").config();
const { REST, Routes } = require("discord.js");
const settings = require("../src/config/settings");
const { coopftGuildId, fukishokaiGuildId, configuredGuildIds, personaForGuild } = require("../src/config/server-personas");

function resolveTargetGuildId(env = process.env, configuredGuildId = settings.guildId) {
  const guildId = String(env.DEPLOY_GUILD_ID || configuredGuildId || "").trim();
  if (!/^\d{1,25}$/.test(guildId)) {
    throw new Error(
      "Set FUKISHOKAI_GUILD_ID or DEPLOY_GUILD_ID in .env. Global slash-command deployment is disabled."
    );
  }
  return guildId;
}

async function replaceCommandsForGuild({ rest, clientId, guildId, deployGuild }) {
  await rest.put(Routes.applicationCommands(clientId), { body: [] });
  return deployGuild(guildId);
}

async function deployCoopFTGuild(rest, clientId, guildId) {
  const { loadCoopFTCommands } = require("../src/commands/coopft");
  const commands = Array.from(loadCoopFTCommands().values()).map((command) => command.data.toJSON());
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  return { registeredCount: commands.length, customCount: 0, persona: "CoopFT" };
}

async function deployFukishokaiGuild(guildId) {
  const { pool } = require("../src/database/pool");
  const { CustomCommandService } = require("../src/services/custom-commands");
  try {
    return await new CustomCommandService(pool).deployGuild(guildId);
  } finally {
    await pool.end();
  }
}

async function deploy() {
  if (!settings.discordToken || !settings.clientId) {
    throw new Error("DISCORD_TOKEN and CLIENT_ID are required.");
  }

  const explicitGuildId = String(process.env.DEPLOY_GUILD_ID || "").trim();
  const targets = explicitGuildId
    ? [resolveTargetGuildId(process.env, settings.guildId)]
    : configuredGuildIds();

  if (!targets.length) throw new Error("No supported server IDs are configured.");
  const uniqueTargets = [...new Set(targets)];
  if (uniqueTargets.some((guildId) => !/^\d{1,25}$/.test(guildId))) {
    throw new Error("Every configured server ID must be a valid Discord snowflake.");
  }
  if (coopftGuildId && fukishokaiGuildId && coopftGuildId === fukishokaiGuildId) {
    throw new Error("CoopFT and Fukishōkai must use different server IDs.");
  }

  const rest = new REST({ version: "10" }).setToken(settings.discordToken);
  // Keep the application's global command set empty so each server sees only
  // the slash commands belonging to its own persona.
  await rest.put(Routes.applicationCommands(settings.clientId), { body: [] });

  const results = [];
  for (const guildId of uniqueTargets) {
    const persona = personaForGuild(guildId);
    if (persona === "coopft") {
      results.push({ guildId, ...(await deployCoopFTGuild(rest, settings.clientId, guildId)) });
    } else if (persona === "fukishokai") {
      results.push({ guildId, persona: "Fukishōkai", ...(await deployFukishokaiGuild(guildId)) });
    } else {
      throw new Error("Refusing to deploy commands to an unconfigured server: " + guildId);
    }
  }

  for (const result of results) {
    console.log(
      "Deployed " + result.registeredCount + " " + result.persona +
      " commands to server " + result.guildId +
      (result.customCount ? " (" + result.customCount + " custom)." : ".")
    );
  }
  console.log("Global slash commands cleared. Per-server command sets are isolated.");
  return results;
}

if (require.main === module) {
  deploy().catch((error) => {
    console.error("[deploy] Failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { deploy, resolveTargetGuildId, replaceCommandsForGuild, deployCoopFTGuild };
