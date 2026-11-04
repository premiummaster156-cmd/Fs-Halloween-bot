require("dotenv").config();
const { Client, GatewayIntentBits, Events, MessageFlags, AuditLogEvent } = require("discord.js");
const { DomainError } = require("./utils/core");
const settings = require("./config/settings");
const balancing = require("./config/game-balancing");
const { pool } = require("./database/pool");
const { migrate } = require("./database/migrate");
const { loadCommands } = require("./commands");
const { handleDashboardInteraction } = require("./commands/dashboard");
const { EconomyService } = require("./services/economy");
const { JobsGame } = require("./games/jobs");
const { CrimeGame } = require("./games/crime");
const { CasinoGame } = require("./games/casino");
const { HeistsGame } = require("./games/heists");
const { HalloweenGame } = require("./games/halloween");
const { ActivityService } = require("./services/activity");
const { InventoryService } = require("./services/inventory");
const { GuildSettingsService } = require("./services/guild-settings");
const { SecurityService } = require("./services/security");
const { respond } = require("./ui");

const MEMBER_COMMANDS_CHANNEL_ID = "1566508610459271478";

async function start() {
  if (!settings.discordToken) throw new Error("DISCORD_TOKEN is missing.");
  if (!settings.clientId) throw new Error("CLIENT_ID is missing.");
  await migrate();
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildModeration] });
  const economy = new EconomyService(pool);
  const inventory = new InventoryService(pool, economy);
  const guildSettings = new GuildSettingsService(pool);
  const security = new SecurityService(pool, guildSettings);
  client.services = {
    pool, balancing, economy, inventory, guildSettings, security,
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
    if (interaction.isButton() && interaction.customId.startsWith("security:")) {
      try {
        await security.handleAlertInteraction(interaction);
      } catch (error) {
        console.error("[security] Alert action failed:", error.code || error.name, error.message);
        try {
          await interaction.reply({ content: "That security action could not be completed. Check the bot's permissions and try again.", flags: MessageFlags.Ephemeral });
        } catch (_) {}
      }
      return;
    }

    const isDashboardInteraction =
      (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) &&
      (interaction.customId.startsWith("dash:") || interaction.customId.startsWith("admin:"));

    if (isDashboardInteraction) {
      try {
        const access = await security.checkAccess(interaction);
        if (!access.allowed) {
          return interaction.reply({
            content: access.expiresAt
              ? "Bot access is temporarily paused until <t:" + Math.floor(new Date(access.expiresAt).getTime() / 1000) + ":R>. Contact a server owner if you think this is a mistake."
              : "Bot access has been restricted by a server owner. Contact the server owner if you think this is a mistake.",
            flags: MessageFlags.Ephemeral
          });
        }
        const rate = await security.checkComponentRate(interaction);
        if (!rate.allowed) {
          return interaction.reply({ content: "You're clicking through the dashboard very quickly. Please pause for a moment and try again.", flags: MessageFlags.Ephemeral });
        }
        await handleDashboardInteraction(interaction, client.services);
      } catch (error) {
        console.error("[dashboard] Interaction failed:", error.code || error.name, error.message);
        if (error.code === "COOLDOWN") {
          await security.recordCooldownAttempt(interaction, error).catch((loggingError) =>
            console.error("[security] Could not record cooldown attempt:", loggingError.message)
          );
        } else if (!(await security.isAboveBotRole(interaction.guild, interaction.user.id))) {
          await require("./utils/logging").audit(pool, interaction.guildId, interaction.user.id, "member_interaction_failed", interaction.user.id, {
            code: error.code || error.name,
            customId: interaction.customId || null
          });
        }
        try {
          await respond(interaction, {
            kind: error.code === "COOLDOWN" ? "warning" : "error",
            icon: error.code === "COOLDOWN" ? "cooldown" : "failed",
            title: error.code === "COOLDOWN" ? "Please wait" : "Action could not be completed",
            description: error instanceof DomainError ? error.message : error.message || "Please try again. Your progress has not been intentionally changed."
          });
        } catch (replyError) {
          console.error("[dashboard] Could not report interaction failure:", replyError.code || replyError.name, replyError.message);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) return respond(interaction, { kind: "error", ephemeral: true, title: "Server Only", description: "Use this command inside Fukishokai." });

    const ownerAccess = await security.hasAdminAccess(interaction.guild, interaction.user.id);
    if (interaction.commandName === "admin" && !ownerAccess) {
      await security.recordUnauthorizedAdminAttempt(interaction);
      return respond(interaction, {
        kind: "error", ephemeral: true, title: "Owner access required",
        description: "Only the server owner, configured bot owner, or Admin Role selected in /admin panel can open the administration console."
      });
    }

    const access = await security.checkAccess(interaction);
    if (!access.allowed) {
      return respond(interaction, {
        kind: "error", ephemeral: true, title: "Bot access restricted",
        description: access.expiresAt
          ? "Bot access is paused until <t:" + Math.floor(new Date(access.expiresAt).getTime() / 1000) + ":R>."
          : "Bot access has been restricted by a server owner."
      });
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return respond(interaction, {
        kind: "error", ephemeral: true, title: "Command unavailable",
        description: "This command is not available in the bot's current version. Ask an owner to redeploy the slash commands."
      });
    }

    const rate = await security.checkCommandRate(interaction);
    if (!rate.allowed) {
      return respond(interaction, {
        kind: "warning", ephemeral: true, title: "Slow down a little",
        description: "The bot is rate-limiting repeated command requests. Please wait a few seconds."
      });
    }

    if (!ownerAccess && interaction.channelId !== MEMBER_COMMANDS_CHANNEL_ID) {
      return respond(interaction, {
        kind: "error", ephemeral: true, title: "Use the game channel",
        description: "Open /menu in <#" + MEMBER_COMMANDS_CHANNEL_ID + ">. This notice is private."
      });
    }

    const startedAt = Date.now();
    const privateReply = command.data.name === "admin" || command.data.name === "menu";
    try {
      await interaction.deferReply(privateReply ? { flags: MessageFlags.Ephemeral } : {});
    } catch (error) {
      console.error("[interaction] Could not acknowledge /" + command.data.name + ":", error.code || error.name, error.message);
      return;
    }

    try {
      await command.execute(interaction, client.services);
    } catch (error) {
      console.error("[command] " + interaction.commandName + " failed:", error.code || error.name, error.message);
      if (error.code === "COOLDOWN") {
        await security.recordCooldownAttempt(interaction, error).catch((loggingError) =>
          console.error("[security] Could not record cooldown attempt:", loggingError.message)
        );
      } else if (!(await security.isAboveBotRole(interaction.guild, interaction.user.id))) {
        await require("./utils/logging").audit(pool, interaction.guildId, interaction.user.id, "command_failed", interaction.user.id, {
          command: interaction.commandName,
          code: error.code || error.name
        });
      }
      try {
        await respond(interaction, {
          kind: error.code === "COOLDOWN" ? "warning" : "error",
          icon: error.code === "COOLDOWN" ? "cooldown" : "failed",
          title: error.code === "COOLDOWN" ? "Please wait" : "Action could not be completed",
          description: error instanceof DomainError ? error.message : "The command could not be completed right now. Please try again shortly."
        });
      } catch (replyError) {
        console.error("[command] Could not send error response:", replyError.code || replyError.name, replyError.message);
      }
    } finally {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= 3000) console.warn("[command] /" + command.data.name + " took " + elapsedMs + "ms in guild " + interaction.guildId + ".");
    }
  });

  client.on(Events.MessageCreate, (message) => {
    if (!message.guildId || message.author.bot || message.webhookId) return;
    const roleIds = message.member ? Array.from(message.member.roles.cache.keys()) : [];
    client.services.activity.trackMessage(message, roleIds).catch((error) => {
      console.error("[activity] Message tracking failed:", error.message);
    });
  });

  // Lightweight anti-nuke watch. Attribution depends on the bot having View Audit Log.
  client.on("channelDelete", (channel) => {
    client.services.security.recordDestructiveChange(client, channel.guild, channel.id, "channel_delete", AuditLogEvent.ChannelDelete)
      .catch((error) => console.error("[security] Channel-delete monitor failed:", error.message));
  });
  client.on("roleDelete", (role) => {
    client.services.security.recordDestructiveChange(client, role.guild, role.id, "role_delete", AuditLogEvent.RoleDelete)
      .catch((error) => console.error("[security] Role-delete monitor failed:", error.message));
  });
  client.on("guildBanAdd", (ban) => {
    client.services.security.recordDestructiveChange(client, ban.guild, ban.user.id, "member_ban", AuditLogEvent.MemberBanAdd)
      .catch((error) => console.error("[security] Ban monitor failed:", error.message));
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
