require("dotenv").config();
const { Client, GatewayIntentBits, Events, MessageFlags, PermissionFlagsBits } = require("discord.js");
const { DomainError } = require("./utils/core");
const settings = require("./config/settings");
const balancing = require("./config/game-balancing");
const { pool } = require("./database/pool");
const { migrate } = require("./database/migrate");
const { loadCommands, handleAdminPanelComponent } = require("./commands");
const { EconomyService } = require("./services/economy");
const { JobsGame } = require("./games/jobs");
const { CrimeGame } = require("./games/crime");
const { CasinoGame } = require("./games/casino");
const { HeistsGame } = require("./games/heists");
const { HalloweenGame } = require("./games/halloween");
const { ActivityService } = require("./services/activity");
const { InventoryService } = require("./services/inventory");
const { GuildSettingsService } = require("./services/guild-settings");
const { respond } = require("./ui");

const MEMBER_COMMANDS_CHANNEL_ID = "1566508610459271478";

async function isPrivilegedCommandUser(interaction, guildSettings) {
  if (
    (settings.ownerId && interaction.user.id === settings.ownerId) ||
    (interaction.guild && interaction.guild.ownerId === interaction.user.id) ||
    (interaction.memberPermissions && (
      interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
    ))
  ) return true;

  const roleIds = interaction.member && interaction.member.roles && interaction.member.roles.cache
    ? Array.from(interaction.member.roles.cache.keys())
    : [];
  const configuredAdminRoleId = await guildSettings.get(interaction.guildId, "adminRoleId");
  return Boolean(
    (configuredAdminRoleId && roleIds.includes(configuredAdminRoleId)) ||
    settings.adminRoleIds.some((id) => roleIds.includes(id))
  );
}

async function start() {
  if (!settings.discordToken) throw new Error("DISCORD_TOKEN is missing.");
  if (!settings.clientId) throw new Error("CLIENT_ID is missing.");
  await migrate();
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
  const economy = new EconomyService(pool);
  const inventory = new InventoryService(pool, economy);
  const guildSettings = new GuildSettingsService(pool);
  client.services = {
    pool, balancing, economy, inventory, guildSettings,
    jobs: new JobsGame(pool, economy, inventory),
    crime: new CrimeGame(pool, economy, inventory),
    casino: new CasinoGame(pool, economy),
    heists: new HeistsGame(pool, economy, inventory),
    halloween: new HalloweenGame(pool, guildSettings),
    activity: new ActivityService(pool, economy)
  };
  client.commands = loadCommands();

  client.once(Events.ClientReady, (ready) => {
    console.log("[bot] Logged in as " + ready.user.tag + " with " + client.commands.size + " commands.");
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isAnySelectMenu() && interaction.customId.startsWith("admin-panel:")) {
      try {
        await handleAdminPanelComponent(interaction, client.services);
      } catch (error) {
        console.error("[admin] Panel setting update failed:", error.code || error.name, error.message);
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "The setting could not be updated. Please try again.", embeds: [], components: [] });
          } else {
            await interaction.reply({ content: "The setting could not be updated. Please try again.", flags: MessageFlags.Ephemeral });
          }
        } catch (replyError) {
          console.error("[admin] Could not report panel setting failure:", replyError.code || replyError.name, replyError.message);
        }
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) return respond(interaction, { kind: "error", ephemeral: true, title: "Server Only", description: "Use this command inside Fukishokai." });
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return respond(interaction, {
        kind: "error",
        ephemeral: true,
        title: "Command Unavailable",
        description: "This command is not available in the bot's current version. Ask an administrator to redeploy the slash commands."
      });
    }

    let privilegedUser = false;
    try {
      privilegedUser = await isPrivilegedCommandUser(interaction, client.services.guildSettings);
    } catch (error) {
      console.error("[commands] Could not check channel access:", error.code || error.name, error.message);
      return respond(interaction, { kind: "error", ephemeral: true, title: "Access Check Failed", description: "Please try again shortly." });
    }

    if (!privilegedUser && interaction.channelId !== MEMBER_COMMANDS_CHANNEL_ID) {
      return respond(interaction, {
        kind: "error",
        ephemeral: true,
        title: "Use the Commands Channel",
        description: "Member commands can only be used in <#" + MEMBER_COMMANDS_CHANNEL_ID + ">. Your command response is private."
      });
    }

    const startedAt = Date.now();
    const privateReply = command.data.name === "admin";
    try {
      // Acknowledge before any database or Discord API work; Discord expires unacknowledged interactions quickly.
      await interaction.deferReply(privateReply ? { flags: MessageFlags.Ephemeral } : {});
    } catch (error) {
      console.error(
        "[interaction] Could not acknowledge /" + command.data.name + " for " + interaction.user.id + ":",
        error.code || error.name,
        error.message
      );
      return;
    }

    try {
      await command.execute(interaction, client.services);
    } catch (error) {
      console.error("[command] " + interaction.commandName + " failed:", error.code || error.name, error.message);
      try {
        await respond(interaction, {
          kind: error.code === "COOLDOWN" ? "warning" : "error",
          icon: error.code === "COOLDOWN" ? "cooldown" : "failed",
          title: error.code === "COOLDOWN" ? "Take a Break" : "Action Failed",
          description: error instanceof DomainError
            ? error.message
            : "The command could not be completed right now. Please try again shortly."
        });
      } catch (replyError) {
        console.error(
          "[command] Could not send error response for /" + command.data.name + ":",
          replyError.code || replyError.name,
          replyError.message
        );
      }
    } finally {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= 3000) {
        console.warn("[command] /" + command.data.name + " took " + elapsedMs + "ms in guild " + interaction.guildId + ".");
      }
    }
  });

  client.on(Events.MessageCreate, (message) => {
    if (!message.guildId || message.author.bot || message.webhookId) return;
    const roleIds = message.member ? Array.from(message.member.roles.cache.keys()) : [];
    client.services.activity.trackMessage(message, roleIds).catch((error) => {
      console.error("[activity] Message tracking failed:", error.message);
    });
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
