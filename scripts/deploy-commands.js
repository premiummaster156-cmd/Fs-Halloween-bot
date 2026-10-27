require("dotenv").config();
const { REST, Routes } = require("discord.js");
const settings = require("../src/config/settings");
const { loadCommands } = require("../src/commands");

async function deploy() {
  if (!settings.discordToken || !settings.clientId) throw new Error("DISCORD_TOKEN and CLIENT_ID are required.");
  const commands = Array.from(loadCommands().values()).map((command) => command.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(settings.discordToken);
  if (settings.guildId) {
    await rest.put(Routes.applicationGuildCommands(settings.clientId, settings.guildId), { body: commands });
    console.log("Registered " + commands.length + " commands to guild " + settings.guildId + ".");
  } else {
    await rest.put(Routes.applicationCommands(settings.clientId), { body: commands });
    console.log("Registered " + commands.length + " global commands.");
  }
}
deploy().catch((error) => { console.error("[deploy] Failed:", error.message); process.exitCode = 1; });
