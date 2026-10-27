require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");
const settings = require("./config/settings");
const balancing = require("./config/game-balancing");
const { pool } = require("./database/pool");
const { migrate } = require("./database/migrate");
const { loadCommands } = require("./commands");
const { EconomyService } = require("./services/economy");
const { JobsGame } = require("./games/jobs");
const { CrimeGame } = require("./games/crime");
const { CasinoGame } = require("./games/casino");
const { HeistsGame } = require("./games/heists");
const { HalloweenGame } = require("./games/halloween");
const { respond } = require("./ui");

async function start() {
  if (!settings.discordToken) throw new Error("DISCORD_TOKEN is missing.");
  if (!settings.clientId) throw new Error("CLIENT_ID is missing.");
  await migrate();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const economy = new EconomyService(pool);
  client.services = {
    pool, balancing, economy,
    jobs: new JobsGame(pool, economy),
    crime: new CrimeGame(pool, economy),
    casino: new CasinoGame(pool, economy),
    heists: new HeistsGame(pool, economy),
    halloween: new HalloweenGame(pool)
  };
  client.commands = loadCommands();

  client.once(Events.ClientReady, (ready) => {
    console.log("[bot] Logged in as " + ready.user.tag + " with " + client.commands.size + " commands.");
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) return respond(interaction, { kind: "error", ephemeral: true, title: "Server Only", description: "Use this command inside Fukishokai." });
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, client.services);
    } catch (error) {
      console.error("[command] " + interaction.commandName + " failed:", error.code || error.name, error.message);
      try {
        await respond(interaction, {
          kind: error.code === "COOLDOWN" ? "warning" : "error",
          ephemeral: true,
          title: error.code === "COOLDOWN" ? "Take a Break" : "Action Failed",
          description: error.message || "Something went wrong. Please try again later."
        });
      } catch (replyError) {
        console.error("[command] Could not send error response:", replyError.message);
      }
    }
  });

  client.on(Events.Error, (error) => console.error("[discord] Client error:", error.message));
  await client.login(settings.discordToken);
  const shutdown = async (signal) => {
    console.log("[bot] Shutting down after " + signal + ".");
    client.destroy();
    await pool.end();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("[startup] Failed:", error.message);
  process.exitCode = 1;
});
