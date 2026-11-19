require("dotenv").config();
const {
  installConsoleFileLogging,
  installProcessErrorLogging,
  startMemoryMonitor,
  guardEmitter
} = require("./utils/runtime-logger");
const runtimeLogger = installConsoleFileLogging();
installProcessErrorLogging(runtimeLogger);
const memoryMonitor = startMemoryMonitor(runtimeLogger);

const { Client, Events, MessageFlags, AuditLogEvent, MessageType, SystemChannelFlags, PermissionFlagsBits, Partials } = require("discord.js");
const { getGatewayIntents } = require("./config/gateway-intents");
const { DomainError } = require("./utils/core");
const settings = require("./config/settings");
const balancing = require("./config/game-balancing");
const { pool, coopftPool } = require("./database/pool");
const { migrate, migrateCoopFT } = require("./database/migrate");
const { moveCoopFTGuildData } = require("./database/move-coopft-guild-data");
const { loadCommands } = require("./commands");
const { loadCoopFTCommands } = require("./commands/coopft");
const { CoopFTCommunityService } = require("./services/coopft-community");
const { MemberLifecycleService } = require("./services/member-lifecycle");
const { personaForGuild, coopftGuildId, fukishokaiGuildId } = require("./config/server-personas");
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
const { CombatService } = require("./services/combat");
const { GuildSettingsService } = require("./services/guild-settings");
const { SecurityService } = require("./services/security");
const { RaidMonitor } = require("./services/raid-monitor");
const { ServerBoosterService } = require("./services/server-boosters");
const { CustomCommandService } = require("./services/custom-commands");
const { TradeService } = require("./services/trade-interactions");
const { EconomyEventService } = require("./services/economy-events");
const { AdminMessagingService } = require("./services/admin-messaging");
const { AdminAbuseService } = require("./services/admin-abuse");
const { respond, respondPrivately } = require("./ui");
const { isPrivateCommandReply } = require("./utils/interaction-visibility");
const { isModalLaunchInteraction, acknowledgeDashboardInteraction } = require("./utils/dashboard-interactions");

async function handleTradeInvitationButton(interaction, client) {
  const [, decision, guildId, tradeId] = interaction.customId.split(":");
  if (!["accept", "deny"].includes(decision) || !guildId || !tradeId) {
    return interaction.reply({ content: "This trade invitation button is invalid.", flags: MessageFlags.Ephemeral });
  }
  const current = await client.services.trades.get(guildId, tradeId);
  if (!current || current.status !== "pending") {
    return interaction.reply({ content: "This invitation has already been answered or has expired.", flags: MessageFlags.Ephemeral });
  }
  if (current.target_id !== interaction.user.id) {
    return interaction.reply({ content: "Only the member invited to this trade can accept or deny it.", flags: MessageFlags.Ephemeral });
  }
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    return interaction.reply({ content: "The server for this invitation is unavailable. Contact a server owner.", flags: MessageFlags.Ephemeral });
  }
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    return interaction.reply({ content: "You must still be a member of that server to respond to its trade invitations.", flags: MessageFlags.Ephemeral });
  }
  const securityContext = { guild, guildId, user: interaction.user, client };
  const access = await client.services.security.checkAccess(securityContext);
  if (!access.allowed) {
    const until = access.expiresAt
      ? " until <t:" + Math.floor(new Date(access.expiresAt).getTime() / 1000) + ":R>"
      : "";
    return interaction.reply({
      content: "Your Fukishokai access is restricted" + until + ". Contact a server owner if you think this is a mistake.",
      flags: MessageFlags.Ephemeral
    });
  }
  const rate = await client.services.security.checkComponentRate(securityContext);
  if (!rate.allowed) {
    return interaction.reply({ content: "You're clicking controls too quickly. Please pause and try again.", flags: MessageFlags.Ephemeral });
  }
  await interaction.deferUpdate();
  try {
    const result = await client.services.trades.respondToInvitation(guildId, tradeId, interaction.user.id, decision);
    const accepted = result.decision === "accepted";
    const guildName = client.guilds.cache.get(guildId)?.name || "Fukishokai";
    await interaction.editReply({
      content: accepted
        ? "✅ You accepted the trade invitation from <@" + result.trade.initiator_id + "> in **" + guildName + "**. The trade is now open. Run `/menu` in the server and choose **Trade** to make your offer."
        : "❌ You denied the trade invitation from <@" + result.trade.initiator_id + "> in **" + guildName + "**. The trade has been cancelled; no FC or items were exchanged.",
      components: []
    });
    const initiator = await client.users.fetch(result.trade.initiator_id).catch(() => null);
    const notice = accepted
      ? "✅ <@" + interaction.user.id + "> accepted your Fukishokai trade invitation in **" + guildName + "**. The trade is now open. Run `/menu` → **Trade** to start making offers."
      : "❌ <@" + interaction.user.id + "> denied your Fukishokai trade invitation in **" + guildName + "**. The trade was cancelled; no FC or items were exchanged.";
    let senderNotified = false;
    if (initiator) {
      try {
        await initiator.send({ content: notice, allowedMentions: { users: [interaction.user.id] } });
        senderNotified = true;
      } catch (error) {
        console.warn("[trade] Could not DM invitation sender; trying a server channel:", error.message);
      }
    }
    if (!senderNotified) {
      const fallbackChannel = interaction.guildId === guildId && interaction.channel?.guildId === guildId
        ? interaction.channel
        : guild.systemChannel;
      if (fallbackChannel?.isTextBased?.()) {
        await fallbackChannel.send({
          content: "<@" + result.trade.initiator_id + "> " + notice,
          allowedMentions: { users: [result.trade.initiator_id] }
        }).catch(error => console.warn("[trade] Could not post sender notification fallback:", error.message));
      }
    }
    await require("./utils/logging").audit(
      pool, guildId, interaction.user.id,
      accepted ? "player_trade_invitation_accepted" : "player_trade_invitation_denied",
      result.trade.initiator_id, { tradeId }
    ).catch(error => console.warn("[trade] Could not log invitation response:", error.message));
  } catch (error) {
    const message = error.code === "TRADE_EXPIRED"
      ? "⌛ This trade invitation has expired. No trade was opened."
      : error.message || "This invitation could not be processed. Please reopen /menu → Trade.";
    await interaction.editReply({ content: message, components: [] }).catch(() => null);
  }
}

let runtimeClient = null;

async function start() {
  if (!settings.discordToken) throw new Error("DISCORD_TOKEN is missing.");
  if (!settings.clientId) throw new Error("CLIENT_ID is missing.");
  await migrate();
  if (coopftPool) {
    await migrateCoopFT();
    const transfer = await moveCoopFTGuildData({
      sourcePool: pool,
      destinationPool: coopftPool,
      guildId: coopftGuildId,
      sourceUrl: settings.databaseUrl,
      destinationUrl: settings.coopftDatabaseUrl
    });
    console.info("[coopft] Dedicated Neon database verified:", transfer);
  } else {
    console.warn("[coopft] COOPFT_DATABASE_URL is not configured. CoopFT database features are paused; no CoopFT data will be written to Fukishokai's DATABASE_URL.");
  }
  // Discord Support approved GuildMembers under request 69920914 for actual-join
  // raid detection. GuildMessages and GuildModeration are non-privileged intents
  // required by existing message-activity/boost and audit-log event handlers.
  // Keep GuildPresences and MessageContent disabled; message-content monitoring is not implemented.
  const gatewayIntents = getGatewayIntents();
  console.info("[discord] Gateway intents: Guilds, GuildMessages, GuildModeration, GuildMembers (approved; used for join events and CoopFT role-based directory sync).");
  const client = new Client({ intents: gatewayIntents, partials: [Partials.Channel] });
  runtimeClient = client;
  guardEmitter(client, {
    logger: runtimeLogger,
    onError: async (event, error, args) => {
      const interaction = args.find((value) =>
        value && typeof value.isRepliable === "function" && value.isRepliable()
      );
      if (!interaction || interaction.isAutocomplete?.()) return;

      const payload = {
        content: "⚠️ An unexpected error occurred while processing this interaction. It has been recorded in the bot's runtime log. Please try again.",
        allowedMentions: { parse: [] }
      };
      try {
        if (interaction.deferred) {
          await interaction.editReply({ ...payload, embeds: [], components: [] });
        } else if (interaction.replied) {
          await interaction.followUp({ ...payload, ephemeral: true });
        } else {
          await interaction.reply({ ...payload, ephemeral: true });
        }
      } catch (replyError) {
        runtimeLogger.warn("[event-guard] Could not send interaction fallback:", replyError);
      }
    }
  });
  guardEmitter(client.rest, { logger: runtimeLogger });
  const economy = new EconomyService(pool);
  const economyEvents = new EconomyEventService(pool);
  const adminAbuse = new AdminAbuseService(pool, economy);
  economy.economyEvents = economyEvents;
  const inventory = new InventoryService(pool, economy);
  const combat = new CombatService(pool, economy);
  economy.inventory = inventory;
  const guildSettings = new GuildSettingsService(pool);
  const security = new SecurityService(pool, guildSettings);
  const raidMonitor = new RaidMonitor({ security });
  economy.security = security;
  economy.client = client;
  const serverBoosters = new ServerBoosterService(pool);
  const customCommands = new CustomCommandService(pool);
  const coopftGuildSettings = coopftPool ? new GuildSettingsService(coopftPool) : null;
  const coopftCommunity = coopftPool ? new CoopFTCommunityService(coopftPool) : null;
  const memberLifecycle = coopftPool
    ? new MemberLifecycleService(coopftPool, { guildSettings: coopftGuildSettings, coopftCommunity })
    : null;
  const coopftCommands = loadCoopFTCommands();
  const restoredCommandFiles = await customCommands.restoreWorkspaceFiles();
  console.log("[workspace] Restored " + restoredCommandFiles + " JavaScript command file(s).");
  client.services = {
    pool, balancing, economy, inventory, combat, guildSettings, security, raidMonitor, serverBoosters, customCommands,
    partyGames: new PartyGameService(pool, economy),
    trades: new TradeService(pool),
    economyEvents,
    adminAbuse,
    adminMessaging: new AdminMessagingService(),
    jobs: new JobsGame(pool, economy, inventory),
    crime: new CrimeGame(pool, economy, inventory),
    casino: new CasinoGame(pool, economy, inventory),
    heists: new HeistsGame(pool, economy, inventory),
    arena: new RiftArena(pool, economy, inventory, undefined, combat),
    achievements: new AchievementsGame(pool, economy),
    halloween: new HalloweenGame(pool, guildSettings),
    activity: new ActivityService(pool, economy),
    weeklyQuests: new WeeklyQuestService(pool)
  };
  client.commands = loadCommands();
  client.coopftCommands = coopftCommands;

  client.once(Events.ClientReady, async (ready) => {
    console.log("[bot] Logged in as " + ready.user.tag + " with " + client.commands.size + " Fukishōkai commands and " + client.coopftCommands.size + " CoopFT commands.");

    if (coopftPool && coopftCommunity && coopftGuildId) {
      const coopGuild = ready.guilds.cache.get(coopftGuildId) || await ready.guilds.fetch(coopftGuildId).catch(() => null);
      if (coopGuild) {
        // Refresh Discord's role and bot-member state before comparing configured names.
        // This makes the owner-approved role-name changes reliable across process restarts.
        try {
          await coopGuild.roles.fetch();
          await coopGuild.members.fetchMe().catch((error) => {
            console.warn("[coopft] Could not refresh the bot member before role synchronization:", error.message);
            return null;
          });
          const coopMember = coopGuild.members.me;
          coopMember?.setNickname("CoopFT • Assistant", "Per-server CoopFT identity").catch((error) =>
            console.warn("[coopft] Could not set server nickname:", error.message)
          );

          const loaded = await coopftCommunity.loadManagedRoles(coopGuild);
          console.info("[coopft] Loaded and reconciled managed role references:", loaded);
          try {
            const access = await coopftCommunity.repairPublicChannelAccess(coopGuild);
            console.info("[coopft] Public member visibility/history repair completed:", {
              categories: access.categoriesUpdated,
              channels: access.channelsUpdated,
              missing: access.missing.length
            });
          } catch (error) {
            console.warn("[coopft] Could not repair public member channel access:", error.message);
          }

          // Rebuild the existing directory message after role names and IDs are current.
          const directory = await coopftCommunity.startStaffDirectoryRefresh(coopGuild);
          console.info("[coopft] Startup staff directory refresh completed:", directory);
        } catch (error) {
          console.warn("[coopft] Could not synchronize CoopFT roles or staff directory on startup:", error.message);
        }
      }
    }

    if (fukishokaiGuildId) {
      const fsGuild = ready.guilds.cache.get(fukishokaiGuildId);
      if (fsGuild) {
        // Fukishōkai's system channel may be the boosts channel. Suppress native
        // join and boost notices there so Discord cannot post member welcomes
        // or premium-subscription announcements into that channel.
        // CoopFT's own welcome flow remains separate and CoopFT-only.
        try {
          const flags = fsGuild.systemChannelFlags;
          const nativeNoticeFlags = [
            SystemChannelFlags.SuppressJoinNotifications,
            SystemChannelFlags.SuppressJoinNotificationReplies,
            SystemChannelFlags.SuppressPremiumSubscriptions
          ].filter((flag) => flag !== undefined);
          const missingFlags = nativeNoticeFlags.filter((flag) => !flags.has(flag));
          if (missingFlags.length) {
            await fsGuild.edit({
              systemChannelFlags: flags.add(...missingFlags)
            }, "Suppress native member-join and boost notices in Fukishōkai");
          }
          console.info("[fukishokai] Native member-join and boost notices are suppressed in the system channel.");
        } catch (error) {
          console.warn("[fukishokai] Could not suppress native member-join/boost notices (Manage Server may be required):", error.message);
        }
        const me = fsGuild.members.me;
        me?.setNickname("Fukishōkai", "Per-server Fukishōkai identity").catch((error) =>
          console.warn("[fukishokai] Could not set server nickname:", error.message)
        );
        raidMonitor.initializeGuild(fsGuild).catch((error) =>
          console.warn("[raid-monitor] Startup invite baseline failed:", error.message)
        );
      }
    }

    console.info("[coopft] Server setup is manual. Run `npm run coopft:setup` from the hosting console when you want to create or repair CoopFT resources.");
  });

  client.on(Events.GuildCreate, (guild) => {
    if (guild.id === fukishokaiGuildId) {
      const me = guild.members.me;
      me?.setNickname("Fukishōkai", "Per-server Fukishōkai identity").catch((error) =>
        console.warn("[fukishokai] Could not set server nickname:", error.message)
      );
      raidMonitor.initializeGuild(guild).catch((error) =>
        console.warn("[raid-monitor] Fukishōkai invite baseline failed:", error.message)
      );
    } else if (guild.id === coopftGuildId) {
      const me = guild.members.me;
      me?.setNickname("CoopFT • Assistant", "Per-server CoopFT identity").catch((error) =>
        console.warn("[coopft] Could not set server nickname:", error.message)
      );
    }
  });

  client.on(Events.GuildMemberAdd, (member) => {
    // Member lifecycle, welcome embeds and autoroles belong exclusively to CoopFT.
    // Fukishōkai only runs its own anti-raid join monitor here.
    if (member.guild.id === coopftGuildId) {
      if (!memberLifecycle || !coopftCommunity) return;
      memberLifecycle.handleJoin(member).then(() =>
        coopftCommunity.refreshStaffDirectory(member.guild)
      ).catch((error) =>
        console.error("[coopft] Could not process CoopFT member join:", error.message)
      );
      return;
    }
    if (member.guild.id === fukishokaiGuildId) {
      raidMonitor.handleMemberJoin(member, client).catch((error) =>
        console.error("[raid-monitor] Could not process Fukishōkai member join:", error.message)
      );
    }
  });

  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    if (!coopftPool || !coopftCommunity || newMember.guild.id !== coopftGuildId) return;
    const before = [...oldMember.roles.cache.keys()].sort().join(",");
    const after = [...newMember.roles.cache.keys()].sort().join(",");
    if (before === after) return;
    coopftCommunity.refreshStaffDirectory(newMember.guild).catch((error) =>
      console.warn("[coopft] Could not refresh the staff directory after a role update:", error.message)
    );
  });

  client.on(Events.GuildMemberRemove, (member) => {
    // Leave logs and directory updates are CoopFT-only; never emit them in Fukishōkai.
    if (!memberLifecycle || !coopftCommunity || member.guild.id !== coopftGuildId) return;
    memberLifecycle.handleLeave(member).catch((error) =>
      console.error("[coopft] Could not process CoopFT member departure:", error.message)
    );
    coopftCommunity.handleMemberLeave(member).catch((error) =>
      console.warn("[coopft] Could not update staff directory after member departure:", error.message)
    );
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton?.() && interaction.customId?.startsWith("cf-freebot:")) {
      try {
        if (!coopftCommunity) throw new Error("COOPFT_DATABASE_URL is not configured.");
        await coopftCommunity.handleFreeBotReviewButton(interaction, settings.ownerId, client);
      } catch (error) {
        console.error("[coopft] Free-bot review interaction failed:", error);
        if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "The review action could not be completed.", flags: MessageFlags.Ephemeral }).catch(() => null);
        }
      }
      return;
    }

    // The same Discord application has two isolated server personas. CoopFT
    // receives only its staff/ticket commands; Fukishōkai receives the game bot.
    // DM trade buttons remain bound to their encoded Fukishōkai guild only.
    const dmFukishokaiTrade = !interaction.guildId &&
      interaction.isButton?.() &&
      interaction.customId?.startsWith("trade-invite:") &&
      interaction.customId.split(":")[2] === fukishokaiGuildId;

    if (!dmFukishokaiTrade) {
      const persona = personaForGuild(interaction.guildId);
      if (persona === "coopft") {
        if (!coopftPool || !coopftCommunity) {
          if (interaction.isRepliable?.() && !interaction.isAutocomplete?.()) {
            await interaction.reply({ content: "CoopFT is temporarily unavailable because its dedicated Neon database has not been configured.", flags: MessageFlags.Ephemeral }).catch(() => null);
          }
          return;
        }
        try {
          if (interaction.isButton() && interaction.customId?.startsWith("cf-ticket:")) {
            await coopftCommunity.handleButton(interaction);
            return;
          }
          if (interaction.isStringSelectMenu() && interaction.customId?.startsWith("cf-roles:")) {
            await coopftCommunity.handleSelfRoleSelection(interaction);
            return;
          }
          if (interaction.isStringSelectMenu() && interaction.customId === "cf-ticket:section") {
            await coopftCommunity.handleTicketSectionSelect(interaction);
            return;
          }
          if (interaction.isModalSubmit() && interaction.customId?.startsWith("cf-ticket:submit:")) {
            await coopftCommunity.handleTicketIntakeModal(interaction);
            return;
          }
          if (interaction.isButton() && interaction.customId?.startsWith("cf-application-control:")) {
            await coopftCommunity.handleApplicationControlButton(interaction);
            return;
          }
          if (interaction.isButton() && interaction.customId?.startsWith("cf-application:")) {
            await coopftCommunity.handleApplicationButton(interaction);
            return;
          }
          if (interaction.isStringSelectMenu() && interaction.customId === "cf-application:position-select") {
            await coopftCommunity.handleApplicationSelectMenu(interaction);
            return;
          }
          if (interaction.isModalSubmit() && interaction.customId?.startsWith("cf-application:decision-reason:")) {
            await coopftCommunity.handleApplicationDecisionReason(interaction);
            return;
          }
          if (interaction.isModalSubmit() && interaction.customId?.startsWith("cf-application:submit:")) {
            await coopftCommunity.handleApplicationModal(interaction);
            return;
          }
          if (interaction.isChatInputCommand()) {
            const command = coopftCommands.get(interaction.commandName);
            if (!command) {
              await interaction.reply({
                content: "That command is not part of CoopFT. Fukishōkai economy and game systems are intentionally disabled in this server.",
                flags: MessageFlags.Ephemeral
              });
              return;
            }
            await command.execute(interaction, { ...client.services, pool: coopftPool, guildSettings: coopftGuildSettings, coopft: coopftCommunity });
            return;
          }
          if (interaction.isRepliable() && !interaction.isAutocomplete()) {
            await interaction.reply({ content: "This interaction is not available in the CoopFT bot persona.", flags: MessageFlags.Ephemeral });
          }
        } catch (error) {
          console.error("[coopft] Interaction failed:", error.code || error.name, error.message);
          try {
            const payload = { content: "The CoopFT action could not be completed. Please try again or contact staff.", embeds: [], components: [] };
            if (interaction.deferred) await interaction.editReply(payload);
            else if (!interaction.replied) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
            else await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
          } catch (_) {}
        }
        return;
      }

      if (persona !== "fukishokai") {
        if (interaction.isRepliable() && !interaction.isAutocomplete() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "This bot is configured only for its Fukishōkai and CoopFT servers.",
            flags: MessageFlags.Ephemeral
          }).catch(() => {});
        }
        return;
      }
    }
    if (interaction.isButton() && interaction.customId.startsWith("trade-invite:")) {
      try {
        await handleTradeInvitationButton(interaction, client);
      } catch (error) {
        console.error("[trade] Invitation response failed:", error.code || error.name, error.message);
        try {
          await interaction.reply({ content: "The trade invitation could not be processed. Please reopen /menu → Trade and check its status.", flags: MessageFlags.Ephemeral });
        } catch (_) {}
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("security:")) {
      try {
        await security.handleAlertInteraction(interaction, client);
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
      let dashboardInteraction = interaction;
      try {
        // Modal-launch controls must call showModal() as their initial response.
        // All other components are acknowledged before the database-backed checks.
        if (!isModalLaunchInteraction(interaction)) {
          dashboardInteraction = await acknowledgeDashboardInteraction(interaction);
        }

        const access = await security.checkAccess(interaction);
        if (!access.allowed) {
          return dashboardInteraction.reply({
            content: access.expiresAt
              ? "Bot access is temporarily paused until <t:" + Math.floor(new Date(access.expiresAt).getTime() / 1000) + ":R>. Contact a server owner if you think this is a mistake."
              : "Bot access has been restricted by a server owner. Contact the server owner if you think this is a mistake.",
            flags: MessageFlags.Ephemeral
          });
        }
        const rate = await security.checkComponentRate(interaction);
        if (!rate.allowed) {
          return dashboardInteraction.reply({ content: "You're clicking through the dashboard very quickly. Please pause for a moment and try again.", flags: MessageFlags.Ephemeral });
        }
        await serverBoosters.syncMember(interaction.member, interaction.guild)
          .catch((error) => console.warn("[boosters] Could not refresh member boost status:", error.message));
        await handleDashboardInteraction(dashboardInteraction, client.services);
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
          await respond(dashboardInteraction, {
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

    // Resolve custom-command visibility before deferring so its original response
    // retains the configured public/private behavior. Built-in command lookup is local.
    const command = client.commands.get(interaction.commandName);
    const customCommand = command ? null : await client.services.customCommands.getByName(interaction.guildId, interaction.commandName);
    const privateReply = isPrivateCommandReply(command, customCommand);

    const startedAt = Date.now();
    try {
      await interaction.deferReply(privateReply ? { flags: MessageFlags.Ephemeral } : {});
    } catch (error) {
      console.error("[interaction] Could not acknowledge /" + interaction.commandName + ":", error.code || error.name, error.message);
      return;
    }

    // All database-backed preflight checks run after the initial acknowledgement.
    // A public command's denial is converted to an ephemeral follow-up by
    // respondPrivately(), after deleting the empty public deferred response.
    const ownerAccess = await security.hasAdminAccess(interaction.guild, interaction.user.id);
    if (interaction.commandName === "admin-panel" && !ownerAccess) {
      await security.recordUnauthorizedAdminAttempt(interaction);
      return respondPrivately(interaction, {
        kind: "error", title: "Owner access required",
        description: "Only the server owner, configured bot owner, or Admin Role selected in /admin-panel can open the administration console."
      });
    }

    const access = await security.checkAccess(interaction);
    if (!access.allowed) {
      return respondPrivately(interaction, {
        kind: "error", title: "Bot access restricted",
        description: access.expiresAt
          ? "Bot access is paused until <t:" + Math.floor(new Date(access.expiresAt).getTime() / 1000) + ":R>."
          : "Bot access has been restricted by a server owner."
      });
    }

    if (!command && !customCommand) {
      return respondPrivately(interaction, {
        kind: "error", title: "Command unavailable",
        description: "This command is not available in the bot's current version. Ask an owner to check the command manager."
      });
    }
    if (customCommand && !customCommand.is_active) {
      return respondPrivately(interaction, {
        kind: "warning", title: "Command not activated",
        description: "This custom command has been deployed but is not active yet. An authorized administrator must activate it in the admin panel."
      });
    }

    const rate = await security.checkCommandRate(interaction);
    if (!rate.allowed) {
      return respondPrivately(interaction, {
        kind: "warning", title: "Slow down a little",
        description: "The bot is rate-limiting repeated command requests. Please wait a few seconds."
      });
    }

    const memberCommandsChannelId = await guildSettings.get(interaction.guildId, "memberCommandsChannelId");
    if (!ownerAccess && memberCommandsChannelId && interaction.channelId !== memberCommandsChannelId) {
      return respondPrivately(interaction, {
        kind: "error", title: "Use the game channel",
        description: "Use Fukishokai commands in <#" + memberCommandsChannelId + ">. This notice is private."
      });
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
    // Owner-only source publisher: a single ZIP sent to the bot in DMs is
    // forwarded unchanged to CoopFT's dedicated public release channel.
    if (!message.guildId) {
      if (!message.channel?.isDMBased?.() || message.author?.bot ||
          !settings.ownerId || message.author?.id !== settings.ownerId ||
          !message.attachments?.size) return;

      const reject = async (content) => message.reply({
        content,
        allowedMentions: { parse: [] }
      }).catch(() => null);

      try {
        if (message.attachments.size !== 1) {
          await reject("Send exactly one **.zip** source archive. Add the release title on the first line and optional notes below it.");
          return;
        }
        const attachment = [...message.attachments.values()][0];
        if (!/\.zip$/i.test(String(attachment.name || ""))) {
          await reject("Please ZIP the source folder first, then send the single **.zip** file to me.");
          return;
        }

        const maxBytes = 20 * 1024 * 1024;
        if (Number(attachment.size) > maxBytes) {
          await reject("That archive is larger than 20 MB. Please compress it and send a smaller ZIP.");
          return;
        }

        const attachmentUrl = new URL(String(attachment.url || ""));
        if (attachmentUrl.protocol !== "https:" ||
            !["cdn.discordapp.com", "media.discordapp.net"].includes(attachmentUrl.hostname)) {
          await reject("I couldn't verify that Discord attachment. Please resend the ZIP directly in this DM.");
          return;
        }

        const response = await fetch(attachmentUrl, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error("Discord attachment download returned HTTP " + response.status);
        const declaredLength = Number(response.headers.get("content-length") || 0);
        if (declaredLength > maxBytes) {
          await reject("That archive is larger than 20 MB. Please compress it and send a smaller ZIP.");
          return;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.length || buffer.length > maxBytes) {
          await reject("The ZIP is empty or larger than 20 MB. Please check the file and resend it.");
          return;
        }

        const fileName = String(attachment.name || "coopft-free-bot.zip")
          .replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 100);
        const lines = String(message.content || "").trim().split(/\r?\n/);
        const title = (lines.shift() || fileName.replace(/\.zip$/i, "").replace(/[-_]+/g, " ")).trim().slice(0, 120);
        const description = lines.join("\n").trim().slice(0, 1000);
        const guild = client.guilds.cache.get(coopftGuildId) ||
          await client.guilds.fetch(coopftGuildId).catch(() => null);
        if (!guild || guild.id !== coopftGuildId) {
          throw new Error("The verified CoopFT guild is unavailable.");
        }

        const published = await coopftCommunity.publishFreeBotRelease(guild, {
          buffer, fileName, title, description
        });
        const messageUrl = "https://discord.com/channels/" + guild.id + "/" +
          published.channel.id + "/" + published.message.id;
        await message.reply({
          content: "Published **" + title + "** in <#" + published.channel.id + ">.\n" + messageUrl,
          allowedMentions: { parse: [] }
        });
      } catch (error) {
        console.warn("[coopft] Owner source release failed:", error.message);
        await reject("I couldn't publish that source ZIP. Check that #free-bot-releases exists and that the file is under 20 MB, then try again.");
      }
      return;
    }

    if (message.guildId !== fukishokaiGuildId) return;

    // Server boost notifications/reward announcements are disabled for Fukishōkai.
    // Ignore Discord's native boost system messages instead of turning them into game activity.
    if (message.type === MessageType.GuildBoost) return;

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
    if (newGuild.id !== fukishokaiGuildId) return;
    if (Number.isFinite(Number(newGuild.premiumSubscriptionCount))) {
      serverBoosters.syncGuild(newGuild.id, newGuild.premiumSubscriptionCount)
        .catch((error) => console.warn("[boosters] Guild boost-tier sync failed:", error.message));
    }
  });

  // Anti-nuke monitoring attributes high-impact changes through Discord audit logs.
  // This subsystem is alert-only: it never changes roles, permissions or member status.
  const monitorSecurityChange = (guild, targetId, kind, auditType) => {
    if (!guild || guild.id !== fukishokaiGuildId) return;
    client.services.security.recordDestructiveChange(client, guild, targetId, kind, auditType)
      .catch((error) => console.error("[security] " + kind + " monitor failed:", error.message));
  };
  client.on("channelCreate", (channel) => monitorSecurityChange(channel.guild, channel.id, "channel_create", AuditLogEvent.ChannelCreate));
  client.on("channelDelete", (channel) => monitorSecurityChange(channel.guild, channel.id, "channel_delete", AuditLogEvent.ChannelDelete));
  client.on("roleCreate", (role) => monitorSecurityChange(role.guild, role.id, "role_create", AuditLogEvent.RoleCreate));
  client.on("roleDelete", (role) => monitorSecurityChange(role.guild, role.id, "role_delete", AuditLogEvent.RoleDelete));
  client.on("guildBanAdd", (ban) => monitorSecurityChange(ban.guild, ban.user.id, "member_ban", AuditLogEvent.MemberBanAdd));
  // Audit-log entry events are included in Guild Moderation and let us spot kicks
  // without requesting the privileged Guild Members intent.
  client.on("guildAuditLogEntryCreate", (entry, guild) => {
    const targetId = entry.targetId || entry.target?.id;
    const executorId = entry.executorId || entry.executor?.id;
    if (
      entry.action === AuditLogEvent.MemberRoleUpdate &&
      targetId &&
      [fukishokaiGuildId, coopftGuildId].filter(Boolean).includes(guild.id)
    ) {
      // Store role history with exact member fetches; no member-roster enumeration.
      if (memberLifecycle) memberLifecycle.handleRoleUpdate(guild, targetId, executorId, entry, client.user.id).catch((error) =>
        console.warn("[member-lifecycle] Could not store updated role snapshot:", error.message)
      );

      if (guild.id === coopftGuildId && executorId && executorId !== client.user.id) {
        Promise.all([
          guild.members.fetch(targetId),
          guild.members.fetch(executorId)
        ]).then(async ([member, actor]) => {
          await coopftCommunity.syncStaffMember(guild, member, actor);
        }).catch((error) => console.warn("[coopft] Could not sync staff audit entry:", error.message));
      }
      return;
    }
    if (memberLifecycle && [fukishokaiGuildId, coopftGuildId].filter(Boolean).includes(guild.id)) {
      memberLifecycle.handleServerAuditEntry(guild, entry, client.user.id).catch((error) =>
        console.warn("[member-lifecycle] Could not publish server audit entry:", error.message)
      );
    }
    if (guild.id !== fukishokaiGuildId || entry.action !== AuditLogEvent.MemberKick) return;
    if (targetId) monitorSecurityChange(guild, targetId, "member_kick", AuditLogEvent.MemberKick);
  });

  // One high-impact permission grant can be the start of a nuke, so it is
  // escalated immediately rather than waiting for the mass-action thresholds.
  const criticalRolePermissions = [
    [PermissionFlagsBits.Administrator, "Administrator"],
    [PermissionFlagsBits.ManageGuild, "Manage Server"],
    [PermissionFlagsBits.ManageChannels, "Manage Channels"],
    [PermissionFlagsBits.ManageRoles, "Manage Roles"],
    [PermissionFlagsBits.BanMembers, "Ban Members"],
    [PermissionFlagsBits.KickMembers, "Kick Members"],
    [PermissionFlagsBits.ManageWebhooks, "Manage Webhooks"],
    [PermissionFlagsBits.ManageMessages, "Manage Messages"],
    [PermissionFlagsBits.ManageEvents, "Manage Events"],
    [PermissionFlagsBits.ManageGuildExpressions, "Manage Expressions"]
  ];
  client.on("roleUpdate", (oldRole, newRole) => {
    if (newRole.guild.id !== fukishokaiGuildId) return;
    const granted = criticalRolePermissions
      .filter(([permission]) => newRole.permissions.has(permission) && !oldRole.permissions.has(permission))
      .map(([, label]) => label);
    if (!granted.length) return;
    client.services.security.recordPrivilegeEscalation(
      client, newRole.guild, newRole.id, "role_permission_escalation", AuditLogEvent.RoleUpdate, granted
    ).catch((error) => console.error("[security] Role permission escalation monitor failed:", error.message));
  });
  client.on("channelUpdate", (oldChannel, newChannel) => {
    if (newChannel.guild.id !== fukishokaiGuildId) return;
    const oldOverwrites = oldChannel.permissionOverwrites?.cache;
    const newOverwrites = newChannel.permissionOverwrites?.cache;
    if (!oldOverwrites || !newOverwrites) return;
    const channelPermissions = [
      [PermissionFlagsBits.ManageChannels, "Manage Channels"],
      [PermissionFlagsBits.ManageRoles, "Manage Roles"],
      [PermissionFlagsBits.BanMembers, "Ban Members"],
      [PermissionFlagsBits.KickMembers, "Kick Members"],
      [PermissionFlagsBits.ManageWebhooks, "Manage Webhooks"],
      [PermissionFlagsBits.ManageMessages, "Manage Messages"]
    ];
    const granted = [];
    for (const overwrite of newOverwrites.values()) {
      const previous = oldOverwrites.get(overwrite.id);
      for (const [permission, label] of channelPermissions) {
        if (overwrite.allow.has(permission) && !previous?.allow.has(permission)) {
          granted.push("overwrite " + overwrite.id + ": " + label);
        }
      }
    }
    if (!granted.length) return;
    client.services.security.recordPrivilegeEscalation(
      client, newChannel.guild, newChannel.id, "channel_permission_escalation", AuditLogEvent.ChannelUpdate, granted
    ).catch((error) => console.error("[security] Channel permission escalation monitor failed:", error.message));
  });

  client.on(Events.Error, (error) => console.error("[discord] Client error:", error));
  client.on("shardError", (error, shardId) =>
    console.error("[discord] Gateway shard", shardId, "error:", error)
  );
  client.on("shardDisconnect", (event, shardId) =>
    console.warn("[discord] Gateway shard", shardId, "disconnected:", {
      code: event?.code,
      reason: event?.reason
    })
  );
  client.on("shardReconnecting", (shardId) =>
    console.warn("[discord] Gateway shard", shardId, "is reconnecting.")
  );
  client.on("shardResume", (shardId, replayedEvents) =>
    console.info("[discord] Gateway shard", shardId, "resumed; replayed", replayedEvents, "events.")
  );
  client.rest.on("rateLimited", (info) =>
    console.warn("[discord] REST rate limit:", {
      route: info.route,
      method: info.method,
      retryAfterMs: info.retryAfter,
      scope: info.scope,
      global: info.global
    })
  );
  client.rest.on("invalidRequestWarning", (info) =>
    console.warn("[discord] Invalid REST request warning:", info)
  );
  await client.login(settings.discordToken);
  const { startIdeServer } = require("./web/ide-server");
  const ideServer = await startIdeServer(client, client.services).catch((error) => {
    console.error("[code-studio] Could not start:", error.message);
    return null;
  });
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info("[bot] Graceful shutdown requested by", signal);
    if (security.maintenanceTimer) clearInterval(security.maintenanceTimer);
    clearInterval(memoryMonitor);

    if (ideServer) {
      await new Promise((resolve) => {
        try {
          ideServer.close((error) => {
            if (error) console.warn("[shutdown] IDE server close reported:", error);
            resolve();
          });
        } catch (error) {
          console.warn("[shutdown] Could not close IDE server cleanly:", error);
          resolve();
        }
      });
    }

    try { client.destroy(); } catch (error) {
      console.warn("[shutdown] Discord client close reported:", error);
    }
    try { await pool.end(); } catch (error) {
      console.error("[shutdown] Fukishokai database pool close failed:", error);
      process.exitCode = 1;
    }
    if (coopftPool) {
      try { await coopftPool.end(); } catch (error) {
        console.error("[shutdown] CoopFT database pool close failed:", error);
        process.exitCode = 1;
      }
    }
    runtimeClient = null;
    console.info("[bot] Shutdown cleanup complete.");
    process.exit(process.exitCode || 0);
  };
  const requestShutdown = (signal) => {
    shutdown(signal).catch((error) => {
      runtimeLogger.fatal("[shutdown] Graceful shutdown failed:", error);
      process.exit(1);
    });
  };
  process.once("SIGINT", () => requestShutdown("SIGINT"));
  process.once("SIGTERM", () => requestShutdown("SIGTERM"));
}

start().catch(async (error) => {
  runtimeLogger.fatal("[startup] Failed to start Fukishokai:", error);
  try { runtimeClient?.destroy(); } catch (cleanupError) {
    runtimeLogger.error("[startup] Discord cleanup failed:", cleanupError);
  }
  try { await pool.end(); } catch (cleanupError) {
    runtimeLogger.error("[startup] Fukishokai database cleanup failed:", cleanupError);
  }
  if (coopftPool) {
    try { await coopftPool.end(); } catch (cleanupError) {
      runtimeLogger.error("[startup] CoopFT database cleanup failed:", cleanupError);
    }
  }
  process.exitCode = 1;
});
