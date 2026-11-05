require("dotenv").config();
const { REST, Routes } = require("discord.js");
const settings = require("../src/config/settings");

async function deploy() {
  if (!settings.discordToken || !settings.clientId) {
    throw new Error("DISCORD_TOKEN and CLIENT_ID are required.");
  }

  const guildId = process.env.DEPLOY_GUILD_ID || settings.guildId || null;
  const rest = new REST({ version: "10" }).setToken(settings.discordToken);

  if (guildId) {
    const { pool } = require("../src/database/pool");
    const { CustomCommandService } = require("../src/services/custom-commands");
    try {
      // Deploy the built-ins and saved custom commands together so a routine
      // built-in deployment cannot silently erase administrator-created commands.
      const result = await new CustomCommandService(pool).deployGuild(guildId);
      // Clear global built-ins only after the guild deployment succeeds.
      await rest.put(Routes.applicationCommands(settings.clientId), { body: [] });
      console.log(
        "Registered " + result.registeredCount + " commands in guild " + guildId +
        " (" + result.customCount + " custom); global commands cleared."
      );
    } finally {
      await pool.end();
    }
    return;
  }

  const { loadCommands } = require("../src/commands");
  const commands = Array.from(loadCommands().values()).map((command) => command.data.toJSON());
  await rest.put(Routes.applicationCommands(settings.clientId), { body: commands });
  console.log("Registered exactly " + commands.length + " built-in commands globally.");
}

deploy().catch((error) => {
  console.error("[deploy] Failed:", error.message);
  process.exitCode = 1;
});
