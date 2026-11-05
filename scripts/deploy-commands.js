require("dotenv").config();
const { REST, Routes } = require("discord.js");
const settings = require("../src/config/settings");

function resolveTargetGuildId(env = process.env, configuredGuildId = settings.guildId) {
  const guildId = String(env.DEPLOY_GUILD_ID || configuredGuildId || "").trim();
  if (!/^\\d{1,25}$/.test(guildId)) {
    throw new Error(
      "Set GUILD_ID (or DEPLOY_GUILD_ID) in .env. Global slash-command deployment is disabled to prevent duplicate commands."
    );
  }
  return guildId;
}

async function deploy() {
  if (!settings.discordToken || !settings.clientId) {
    throw new Error("DISCORD_TOKEN and CLIENT_ID are required.");
  }

  // Always replace the command list for one explicit server. Discord's PUT
  // endpoint removes stale guild commands instead of adding another copy.
  const guildId = resolveTargetGuildId();
  const rest = new REST({ version: "10" }).setToken(settings.discordToken);
  const { pool } = require("../src/database/pool");
  const { CustomCommandService } = require("../src/services/custom-commands");

  try {
    const result = await new CustomCommandService(pool).deployGuild(guildId);

    // Clear application-wide commands so Discord cannot show both the old
    // global set and this server-specific set.
    await rest.put(Routes.applicationCommands(settings.clientId), { body: [] });

    console.log(
      "Replaced slash commands for server " + guildId +
      " with " + result.registeredCount + " commands (" + result.customCount +
      " custom). Global commands cleared."
    );
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  deploy().catch((error) => {
    console.error("[deploy] Failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { deploy, resolveTargetGuildId };
