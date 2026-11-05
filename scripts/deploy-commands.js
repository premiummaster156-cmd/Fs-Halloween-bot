require("dotenv").config();
const { REST, Routes } = require("discord.js");
const settings = require("../src/config/settings");
const { loadCommands } = require("../src/commands");

async function deploy() {
  if (!settings.discordToken || !settings.clientId) {
    throw new Error("DISCORD_TOKEN and CLIENT_ID are required.");
  }

  const guildId = process.env.DEPLOY_GUILD_ID || settings.guildId || null;
  const commands = Array.from(loadCommands().values()).map((command) => command.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(settings.discordToken);

  if (guildId) {
    // Guild commands override global commands in that server. Clear globals first so
    // Discord does not show every command twice in the configured guild.
    await rest.put(Routes.applicationCommands(settings.clientId), { body: [] });
    await rest.put(Routes.applicationGuildCommands(settings.clientId, guildId), { body: commands });
    console.log("Registered exactly " + commands.length + " built-in commands in guild " + guildId + "; global commands cleared.");
    return;
  }

  // Without a configured guild, publish the built-ins globally only.
  await rest.put(Routes.applicationCommands(settings.clientId), { body: commands });
  console.log("Registered exactly " + commands.length + " built-in commands globally.");
}

deploy().catch((error) => {
  console.error("[deploy] Failed:", error.message);
  process.exitCode = 1;
});
