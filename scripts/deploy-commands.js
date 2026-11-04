require("dotenv").config();
const { REST, Routes } = require("discord.js");
const settings = require("../src/config/settings");
const { pool } = require("../src/database/pool");
const { loadCommands } = require("../src/commands");
const { toApplicationCommand } = require("../src/services/custom-commands");

async function deploy() {
  if (!settings.discordToken || !settings.clientId) throw new Error("DISCORD_TOKEN and CLIENT_ID are required.");
  const guildId = process.env.DEPLOY_GUILD_ID || settings.guildId || null;
  const commands = Array.from(loadCommands().values()).map((command) => command.data.toJSON());

  if (guildId) {
    const custom = await pool.query(
      "SELECT id, name, description, definition, source_code FROM custom_commands WHERE guild_id = $1 AND deleted_at IS NULL ORDER BY name ASC",
      [guildId]
    );
    const names = new Set(commands.map((command) => command.name));
    for (const record of custom.rows) {
      const command = toApplicationCommand(record);
      if (names.has(command.name)) throw new Error("Custom command name conflicts with an existing command: /" + command.name);
      names.add(command.name);
      commands.push(command);
    }
  }

  const rest = new REST({ version: "10" }).setToken(settings.discordToken);
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(settings.clientId, guildId), { body: commands });
    await pool.query(
      "UPDATE custom_commands SET deployed_at = NOW(), updated_at = NOW() WHERE guild_id = $1 AND deleted_at IS NULL",
      [guildId]
    );
    console.log("Registered " + commands.length + " commands to guild " + guildId + ".");
  } else {
    await rest.put(Routes.applicationCommands(settings.clientId), { body: commands });
    console.log("Registered " + commands.length + " global built-in commands.");
  }
}

deploy()
  .catch((error) => {
    console.error("[deploy] Failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
