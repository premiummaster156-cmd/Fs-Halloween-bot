require("dotenv").config();
const { Client, GatewayIntentBits, Events, MessageFlags, AuditLogEvent, MessageType } = require("discord.js");
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
const { RiftArena } = require("./games/arena");
const { AchievementsGame } = require("./games/achievements");
const { HalloweenGame } = require("./games/halloween");
const { PartyGameService } = require("./services/party-games");
const { ActivityService } = require("./services/activity");
const { WeeklyQuestService } = require("./services/weekly-quests");
const { InventoryService } = require("./services/inventory");
const { GuildSettingsService } = require("./services/guild-settings");
const { SecurityService } = require("./services/security");
const { ServerBoosterService } = require("./services/server-boosters");
const { CustomCommandService } = require("./services/custom-commands");
const { TradeService } = require("./services/trade-interactions");
const { EconomyEventService } = require("./services/economy-events");
const { AdminMessagingService } = require("./services/admin-messaging");
const { AdminAbuseService } = require("./services/admin-abuse");
const { respond } = require("./ui");

async function start() {
  if (!settings.discordToken) throw new Error("DISCORD_TOKEN is missing.");
  if (!settings.clientId) throw new Error("CLIENT_ID is missing.");
  await migrate();
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildModeration] });
  const economy = new EconomyService(pool);
  const economyEvents = new EconomyEventService(pool);
  const adminAbuse = new AdminAbuseService(pool, economy);
  economy.economyEvents = economyEvents;
  const inventory = new InventoryService(pool, economy);
  economy.inventory = inventory;
  const guildSettings = new GuildSettingsService(pool);
  const security = new SecurityService(pool, guildSettings);
  const serverBoosters = new ServerBoosterService(pool);
  const customCommands = new CustomCommandService(pool);
  const restoredCommandFiles = await customCommands.restoreWorkspaceFiles();
  console.log("[workspace] Restored " + restoredCommandFiles + " JavaScript command file(s).");
  client.services = {
    pool, balancing, economy, inventory, guildSettings, security, serverBoosters, customCommands,
    partyGames: new PartyGameService(pool, economy),
    trades: new TradeService(pool),
    economyEvents,
    adminAbuse,
    adminMessaging: new AdminMessagingService(),
    jobs: new JobsGame(pool, economy, inventory),
    crime: new CrimeGame(pool, economy, inventory),
    casino: new CasinoGame(pool, economy, inventory),
    heists: new HeistsGame(pool, economy, inventory),
    arena: new RiftArena(pool, economy, inventory),
    achievements: new AchievementsGame(pool, economy),
    halloween: new HalloweenGame(pool, guildSettings),
    activity: new ActivityService(pool, economy),
    weeklyQuests: new WeeklyQuestService(pool)
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
        await serverBoosters.syncMember(interaction.member, interaction.guild)
          .catch((error) => console.warn("[boosters] Could not refresh member boost status:", error.message));
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
    if (interaction.commandName === "admin-panel" && !ownerAccess) {
      await security.recordUnauthorizedAdminAttempt(interaction);
      return respond(interaction, {
        kind: "error", ephemeral: true, title: "Owner access required",
        description: "Only the server owner, configured bot owner, or Admin Role selected in /admin-panel can open the administration console."
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
    const customCommand = command ? null : await client.services.customCommands.getByName(interaction.guildId, interaction.commandName);
    if (!command && !customCommand) {
      return respond(interaction, {
        kind: "error", ephemeral: true, title: "Command unavailable",
        description: "This command is not available in the bot's current version. Ask an owner to check the command manager."
      });
    }
    if (customCommand && !customCommand.is_active) {
      return respond(interaction, {
        kind: "warning", ephemeral: true, title: "Command not activated",
        description: "This custom command has been deployed but is not active yet. An authorized administrator must activate it in the admin panel."
      });
    }

    const rate = await security.checkCommandRate(interaction);
    if (!rate.allowed) {
      return respond(interaction, {
        kind: "warning", ephemeral: true, title: "Slow down a little",
        description: "The bot is rate-limiting repeated command requests. Please wait a few seconds."
      });
    }

    const memberCommandsChannelId = await guildSettings.get(interaction.guildId, "memberCommandsChannelId");
    if (!ownerAccess && memberCommandsChannelId && interaction.channelId !== memberCommandsChannelId) {
      return respond(interaction, {
        kind: "error", ephemeral: true, title: "Use the game channel",
        description: "Use Fukishokai commands in <#" + memberCommandsChannelId + ">. This notice is private."
      });
    }

    const startedAt = Date.now();
    const privateReply = command
      ? command.data.name === "admin-panel" || command.data.name === "menu"
      : customCommand.definition?.response?.visibility === "private";
    try {
      await interaction.deferReply(privateReply ? { flags: MessageFlags.Ephemeral } : {});
    } catch (error) {
      console.error("[interaction] Could not acknowledge /" + interaction.commandName + ":", error.code || error.name, error.message);
      return;
    }

    try {
      await serverBoosters.syncMember(interaction.member, interaction.guild)
        .catch((error) => console.warn("[boosters] Could not refresh member boost status:", error.message));
      if (command) await command.execute(interaction, client.services);
      else await client.services.customCommands.execute(interaction, customCommand);
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
      if (elapsedMs >= 3000) console.warn("[command] /" + interaction.commandName + " took " + elapsedMs + "ms in guild " + interaction.guildId + ".");
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.guildId) return;

    // Discord's GUILD_BOOST system message records the member who performed a boost.
    // The unique message ID prevents retries or duplicate gateway delivery from granting twice.
    if (message.type === MessageType.GuildBoost) {
      const reward = await serverBoosters.recordBoostMessage(message).catch((error) => {
        console.error("[boosters] Could not record personal boost:", error.message);
        return null;
      });
      if (reward?.granted && reward.item) {
        await message.channel.send({
          content: "🌟 <@" + message.author.id + "> earned **" + reward.item.name +
            "** for personal boost #" + reward.personalBoostCount + "! It was added to your inventory and equipped automatically. Upgrade it from **/menu → Gear**.",
          allowedMentions: { users: [message.author.id] }
        }).catch((error) => console.warn("[boosters] Could not announce booster reward:", error.message));
      }
      return;
    }

    if (message.author.bot || message.webhookId) return;
    const roleIds = message.member?.roles?.cache
      ? Array.from(message.member.roles.cache.keys())
      : Array.isArray(message.member?.roles) ? message.member.roles : [];
    if (message.member) {
      await serverBoosters.syncMember(message.member, message.guild)
        .catch((error) => console.warn("[boosters] Message boost sync failed:", error.message));
    }
    // Chat Candy drops are credited silently. Per-message public notices became noisy;
    // players can see their Candy balance on /profile and in the Weekly Quests dashboard.
    await client.services.activity.trackMessage(message, roleIds).catch((error) => {
      console.error("[activity] Message tracking failed:", error.message);
    });
  });

  client.on(Events.GuildUpdate, (_oldGuild, newGuild) => {
    if (Number.isFinite(Number(newGuild.premiumSubscriptionCount))) {
      serverBoosters.syncGuild(newGuild.id, newGuild.premiumSubscriptionCount)
        .catch((error) => console.warn("[boosters] Guild boost-tier sync failed:", error.message));
    }
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
  const { startIdeServer } = require("./web/ide-server");
  const ideServer = await startIdeServer(client, client.services).catch((error) => {
    console.error("[code-studio] Could not start:", error.message);
    return null;
  });
  const shutdown = async (signal) => {
    console.log("[bot] Shutting down after " + signal + ".");
    if (ideServer) await new Promise((resolve) => ideServer.close(resolve));
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
