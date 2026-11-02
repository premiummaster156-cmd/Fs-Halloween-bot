const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder } = require("discord.js");
const settings = require("../config/settings");
const balancing = require("../config/game-balancing");
const { respond, createEmbed } = require("../ui");
const { getPlayer, getLeaderboard } = require("../services/economy");
const { DomainError, uuid, levelXpRequired } = require("../utils/core");
const { audit, sendLog } = require("../utils/logging");
const { makeWorkChallenge } = require("../games/work-challenge");

function interactionRoleIds(interaction) {
  const roles = interaction.member && interaction.member.roles;
  if (roles && roles.cache) return Array.from(roles.cache.keys());
  return Array.isArray(roles) ? roles : [];
}

async function adminAllowed(interaction, guildSettings) {
  if (settings.ownerId && interaction.user.id === settings.ownerId) return true;
  if (interaction.memberPermissions && (
    interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
  )) return true;
  const adminRoleId = await guildSettings.get(interaction.guildId, "adminRoleId");
  const memberRoles = interactionRoleIds(interaction);
  return Boolean((adminRoleId && memberRoles.includes(adminRoleId)) ||
    settings.adminRoleIds.some((id) => memberRoles.includes(id)));
}


function ownerAllowed(interaction) {
  return Boolean(
    (settings.ownerId && interaction.user.id === settings.ownerId) ||
    (interaction.guild && interaction.guild.ownerId === interaction.user.id)
  );
}

async function adminPanel(i, services) {
  const [event, configured] = await Promise.all([
    services.halloween.status(i.guildId, i.user.id),
    services.guildSettings.getAll(i.guildId)
  ]);
  const eventStatus = !event.event
    ? "Not configured. Start it with **/admin event-start**."
    : (event.active ? "Active" : "Configured but inactive") +
      "\nEnds <t:" + Math.floor(new Date(event.event.ends_at).getTime() / 1000) + ":F>" +
      (event.event.role_id ? "\nFinal reward role: <@&" + event.event.role_id + ">" : "\nNo final reward role is configured.");
  const selectRow = (select) => new ActionRowBuilder().addComponents(select);
  const components = [
    selectRow(new ChannelSelectMenuBuilder()
      .setCustomId("admin-panel:log-channel")
      .setPlaceholder(configured.logChannelId ? "Log channel is configured — select to change" : "Select admin log channel")
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1)
      .setDefaultChannels(configured.logChannelId ? [configured.logChannelId] : [])),
    selectRow(new RoleSelectMenuBuilder()
      .setCustomId("admin-panel:halloween-role")
      .setPlaceholder(configured.halloweenRoleId ? "Halloween reward role is configured — select to change" : "Select Halloween reward role")
      .setMinValues(1)
      .setMaxValues(1)
      .setDefaultRoles(configured.halloweenRoleId ? [configured.halloweenRoleId] : [])),
    selectRow(new RoleSelectMenuBuilder()
      .setCustomId("admin-panel:xp-role")
      .setPlaceholder(configured.xpBoosterRoleId ? "2x XP role is configured — select to change" : "Select role for 2x XP")
      .setMinValues(1)
      .setMaxValues(1)
      .setDefaultRoles(configured.xpBoosterRoleId ? [configured.xpBoosterRoleId] : [])),
    selectRow(new RoleSelectMenuBuilder()
      .setCustomId("admin-panel:admin-role")
      .setPlaceholder(configured.adminRoleId ? "Admin role is configured — select to change" : "Select additional admin role")
      .setMinValues(1)
      .setMaxValues(1)
      .setDefaultRoles(configured.adminRoleId ? [configured.adminRoleId] : [])),
    selectRow(new StringSelectMenuBuilder()
      .setCustomId("admin-panel:clear")
      .setPlaceholder("Clear a configured setting")
      .addOptions(
        { label: "Log channel", value: "logChannelId" },
        { label: "Halloween reward role", value: "halloweenRoleId" },
        { label: "2x XP role", value: "xpBoosterRoleId" },
        { label: "Admin role", value: "adminRoleId" }
      ))
  ];
  return {
    icon: "settings",
    title: "Server Admin Panel",
    description: "Configure this server directly here. Use the menus below to set roles and the log channel, or clear a setting.",
    fields: [
      { name: "Access", value: "Manage Server, Administrator, or the configured admin role can use admin controls." },
      { name: "Economy", value: "Use **/admin grant** for FS Coins or XP, **/admin set-level** for player levels, and **/admin set-job** for careers. These controls are owner-only." },
      { name: "Logging", value: configured.logChannelId ? "<#" + configured.logChannelId + ">" : "Not configured" },
      { name: "Halloween reward role", value: configured.halloweenRoleId ? "<@&" + configured.halloweenRoleId + ">" : "Not configured" },
      { name: "2x XP role", value: configured.xpBoosterRoleId ? "<@&" + configured.xpBoosterRoleId + ">" : "Not configured. Members with this role get double XP." },
      { name: "Admin role", value: configured.adminRoleId ? "<@&" + configured.adminRoleId + ">" : "No additional role configured" },
      { name: "Halloween Event", value: eventStatus + "\n\nUse **/admin event-start** or **/admin event-stop** to manage the event." }
    ],
    components
  };
}

async function handleAdminPanelComponent(interaction, services) {
  await interaction.deferUpdate();
  if (!await adminAllowed(interaction, services.guildSettings)) {
    return interaction.editReply({ content: "You no longer have permission to change server settings.", embeds: [], components: [] });
  }

  const action = interaction.customId.slice("admin-panel:".length);
  const settingByAction = {
    "log-channel": { key: "logChannelId", label: "Log channel" },
    "halloween-role": { key: "halloweenRoleId", label: "Halloween reward role" },
    "xp-role": { key: "xpBoosterRoleId", label: "2x XP role" },
    "admin-role": { key: "adminRoleId", label: "Admin role" }
  };

  if (action === "clear") {
    const key = interaction.values[0];
    await services.guildSettings.clear(interaction.guildId, key);
    await audit(services.pool, interaction.guildId, interaction.user.id, "server_setting_cleared", null, { setting: key });
    await sendLog(interaction.client, interaction.guildId, "Server setting cleared: " + key.replace(/([A-Z])/g, " $1").toLowerCase() + " (by <@" + interaction.user.id + ">).");
  } else {
    const setting = settingByAction[action];
    if (!setting || !interaction.values[0]) throw new Error("Unknown admin panel setting selector.");
    const value = interaction.values[0];
    await services.guildSettings.set(interaction.guildId, setting.key, value, interaction.user.id);
    await audit(services.pool, interaction.guildId, interaction.user.id, "server_setting_updated", null, { setting: setting.key, value });
    await sendLog(interaction.client, interaction.guildId, setting.label + " updated by <@" + interaction.user.id + ">.");
  }

  const panel = await adminPanel(interaction, services);
  const embed = createEmbed(panel);
  return interaction.editReply({ embeds: [embed], components: panel.components });
}

const commands = [
  {
    data: new SlashCommandBuilder().setName("guide").setDescription("Learn how to play and what each system does.")
      .addStringOption((o) => o.setName("topic").setDescription("Choose what you want help with.").setRequired(false).addChoices(
        { name: "Getting started", value: "start" },
        { name: "Money and careers", value: "money" },
        { name: "Crime and casino", value: "risk" },
        { name: "Team heists", value: "heists" },
        { name: "Halloween event", value: "halloween" }
      )),
    async execute(i) {
      const topic = i.options.getString("topic") || "start";
      const guides = {
        start: {
          title: "Welcome — Start Here",
          description: "Build your character, earn FS Coins (FC), and unlock tougher activities as you level up.",
          fields: [
            { name: "1 · Pick a career", value: "Use **/job view**, then **/job apply** and choose Street Runner. You need a job before you can work." },
            { name: "2 · Earn money and XP", value: "Use **/daily** once a day and **/work** whenever your work cooldown ends." },
            { name: "3 · Check your progress", value: "Use **/profile** to see your level and career, or **/balance** to see wallet and bank." },
            { name: "What next?", value: "Spend carefully in **/shop view**, equip gear with **/equip**, or use **/guide** again to learn another system." }
          ]
        },
        money: {
          title: "Money & Careers",
          description: "FC is the main currency. Your wallet and bank are both shown by **/balance**.",
          fields: [
            { name: "Earn", value: "**/daily** gives FC and XP once per 24 hours. **/work** gives you three A–D questions from a 150-question bank. Each correct answer earns part of your shift's FC and XP; higher-paying jobs get harder questions. Chat earns up to 6 XP per counted message, capped at 300 XP per day. Members with the configured XP role earn double. Work has a 10-minute cooldown." },
            { name: "Grow your career", value: "Use **/job view** to see each job's level and wallet requirements. Apply with **/job apply**; working earns job progress and player XP." },
            { name: "Manage FC", value: "Use **/bank deposit** or **/bank withdraw** to move FC between wallet and bank. Use **/transfer** to send FC to another member." },
            { name: "Gear", value: "Use **/shop view** to compare equipment, **/shop buy** to purchase, **/inventory** to see what you own, and **/equip** to equip it." }
          ]
        },
        risk: {
          title: "Crime & Casino",
          description: "These are risky ways to play. You can lose FC, so check the odds and bet size first.",
          fields: [
            { name: "Crime", value: "Use **/crime** and choose an available job. Success pays FC; getting caught costs a fine. Higher level crimes unlock as you progress." },
            { name: "Casino", value: "Use **/casino**, choose a game, and set your bet. A loss can cost the full bet. Games have different odds and unlock at different levels." },
            { name: "Prepare", value: "Check **/profile** for your level and **/balance** before risking FC. Some equipment can improve crime or casino outcomes." }
          ]
        },
        heists: {
          title: "Team Heists",
          description: "Heists need a crew. The leader creates and starts the mission; everyone joins the same heist ID.",
          fields: [
            { name: "1 · Choose a mission", value: "Use **/heist missions** to see level requirements, crew size, difficulty, and potential payout." },
            { name: "2 · Recruit a crew", value: "The leader uses **/heist create** and selects a mission. Share the returned heist ID with your crew." },
            { name: "3 · Join and assign roles", value: "Crew members use **/heist join** with that ID and choose a role. Each role helps the crew's chance." },
            { name: "4 · Run it", value: "The leader uses **/heist start** with the same ID. Use **/heist status** to check a crew while it is recruiting." }
          ]
        },
        halloween: {
          title: "Halloween Event",
          description: "The seasonal event has its own Candy and points, separate from FS Coins. An admin must activate it in this server.",
          fields: [
            { name: "See what's available", value: "Use **/event status** to check whether the event is active and see your Candy and points. Use **/event quests** to see goals and rewards." },
            { name: "Complete and claim quests", value: "Do the activity written in a quest, then use **/event claim** and select that quest to collect its reward." },
            { name: "Weekly mission", value: "Use **/event weekly** to check your eligible message count. When you reach the goal during an active event, use **/event weekly-claim**." },
            { name: "Seasonal shop", value: "Use **/event shop** to browse collectibles and **/event buy** to spend Candy." }
          ]
        }
      };
      const guide = guides[topic];
      return respond(i, { icon: "guide", title: guide.title, description: guide.description, fields: guide.fields, footer: "Need another walkthrough? Use /guide and choose a topic." });
    }
  },
  {
    data: new SlashCommandBuilder().setName("balance").setDescription("Check your or another member's FS Coins.")
      .addUserOption((o) => o.setName("member").setDescription("Member to check").setRequired(false)),
    async execute(i, s) {
      const target = i.options.getUser("member") || i.user;
      const b = await s.economy.getBalance(i.guildId, target.id);
      return respond(i, { title: "Wallet & Bank", description: (target.id === i.user.id ? "Your" : target.username + "'s") + " balance.",
        fields: [
          { name: "Wallet", value: b.wallet.toLocaleString() + " " + settings.currencySymbol, inline: true },
          { name: "Bank", value: b.bank.toLocaleString() + " " + settings.currencySymbol, inline: true },
          { name: "Total", value: b.total.toLocaleString() + " " + settings.currencySymbol, inline: true }
        ] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("bank").setDescription("Deposit or withdraw FS Coins.")
      .addSubcommand((s) => s.setName("deposit").setDescription("Move wallet money into your bank.").addIntegerOption((o) => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1).setMaxValue(10000000)))
      .addSubcommand((s) => s.setName("withdraw").setDescription("Move bank money into your wallet.").addIntegerOption((o) => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1).setMaxValue(10000000))),
    async execute(i, s) {
      const action = i.options.getSubcommand();
      const amount = i.options.getInteger("amount");
      await s.economy.transact(async (client) => {
        await s.economy.ensurePlayerTx(client, i.guildId, i.user.id);
        const row = await client.query("SELECT wallet, bank FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [i.guildId, i.user.id]);
        const p = row.rows[0];
        if (action === "deposit") {
          if (Number(p.wallet) < amount) throw new DomainError("You do not have enough money in your wallet.", "INSUFFICIENT_FUNDS");
          if (Number(p.bank) + amount > balancing.economy.maxWallet) throw new DomainError("That would exceed the bank limit.", "BANK_LIMIT");
          await s.economy.mutateTx(client, i.guildId, i.user.id, -amount, "bank_deposit", uuid(), {});
          await client.query("UPDATE players SET bank = bank + $3, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, i.user.id, amount]);
        } else {
          if (Number(p.bank) < amount) throw new DomainError("You do not have enough money in your bank.", "INSUFFICIENT_BANK_FUNDS");
          await client.query("UPDATE players SET bank = bank - $3, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, i.user.id, amount]);
          await s.economy.mutateTx(client, i.guildId, i.user.id, amount, "bank_withdrawal", uuid(), {});
        }
      });
      return respond(i, { kind: "success", title: "Bank Updated", description: "You " + (action === "deposit" ? "deposited " : "withdrew ") + amount.toLocaleString() + " FC." });
    }
  },
  {
    data: new SlashCommandBuilder().setName("daily").setDescription("Claim your daily FS Coins and XP."),
    async execute(i, s) {
      const r = await s.economy.daily(i.guildId, i.user.id, interactionRoleIds(i));
      const levelText = r.progression.levelsGained ? " You reached level " + r.progression.level + "!" : "";
      return respond(i, { kind: "success", title: "Daily Reward Claimed", description: "You received **" + r.amount.toLocaleString() + " FC**." + levelText, fields: [{ name: "XP gained", value: String(r.progression.gained), inline: true }] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("work").setDescription("Answer three multiple-choice test questions to earn shift pay and XP."),
    async execute(i, s) {
      const shift = await s.jobs.startShift(i.guildId, i.user.id);
      const challenge = makeWorkChallenge(shift.job, shift.jobLevel, 3);
      let correctAnswers = 0;
      let answered = 0;
      let timedOut = false;
      for (let questionIndex = 0; questionIndex < challenge.questions.length; questionIndex += 1) {
        const question = challenge.questions[questionIndex];
        const customId = "work-answer:" + i.id + ":" + questionIndex + ":";
        const row = new ActionRowBuilder().addComponents(question.options.map((option) =>
          new ButtonBuilder()
            .setCustomId(customId + option.letter)
            .setLabel(option.letter)
            .setStyle(ButtonStyle.Secondary)
        ));
        const prompt = await respond(i, {
          icon: "guide",
          title: "Shift Test · Question " + (questionIndex + 1) + "/" + challenge.questions.length + " · " + challenge.band.toUpperCase(),
          description: question.question + "\n\n" + question.options.map((option) => "**" + option.letter + "** · " + option.value).join("\n") + "\n\nChoose **A**, **B**, **C**, or **D** within **60 seconds**.",
          fields: [
            { name: "Career", value: shift.job.name + " · Level " + shift.jobLevel, inline: true },
            { name: "Progress", value: correctAnswers + " correct so far", inline: true },
            { name: "Round", value: "Three questions. Each correct answer adds one third of the normal shift reward. Work cooldown: 10 minutes." }
          ],
          components: [row]
        });
        const collector = prompt.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
        const correct = await new Promise((resolve) => {
          let settled = false;
          const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          };
          collector.on("collect", (component) => {
            if (!component.customId.startsWith(customId)) return;
            if (component.user.id !== i.user.id) {
              component.reply({ content: "This shift challenge belongs to the member who started it.", flags: MessageFlags.Ephemeral })
                .catch((error) => console.warn("[work] Could not reject another member's answer:", error.message));
              return;
            }
            component.deferUpdate().then(() => {
              finish(component.customId.slice(customId.length) === question.answer);
              collector.stop("answered");
            }).catch((error) => {
              console.error("[work] Could not acknowledge challenge answer:", error.code || error.name, error.message);
              finish(null);
              collector.stop("answer_error");
            });
          });
          collector.on("end", () => finish(null));
        });
        if (correct === null) {
          timedOut = true;
          break;
        }
        answered += 1;
        if (correct) correctAnswers += 1;
      }
      if (correctAnswers === 0) {
        return respond(i, {
          kind: "warning", icon: timedOut ? "cooldown" : "failed", title: timedOut ? "Shift Test Timed Out" : "Shift Test Complete",
          description: "You answered " + answered + "/" + challenge.questions.length + " questions correctly. At least one correct answer is needed for FC or XP. The work cooldown still applies."
        });
      }
      const r = await s.jobs.completeShift(i.guildId, i.user.id, shift.job.id, correctAnswers, challenge.questions.length, interactionRoleIds(i));
      const promotion = r.promoted ? " Your job level increased to " + r.jobLevel + "!" : "";
      const levels = r.progression.levelsGained ? " You reached player level " + r.progression.level + "!" : "";
      return respond(i, { kind: "success", title: r.job.name + " — Shift Complete", description: "You got **" + correctAnswers + "/" + challenge.questions.length + "** correct and earned **" + r.pay.toLocaleString() + " FC**." + (timedOut ? " The round timed out, so this is your partial reward." : "") + promotion + levels,
        fields: [{ name: "Job level", value: String(r.jobLevel), inline: true }, { name: "XP gained", value: String(r.progression.gained), inline: true }] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("job").setDescription("View careers or apply for a job.")
      .addSubcommand((s) => s.setName("view").setDescription("View your career and available jobs."))
      .addSubcommand((s) => s.setName("apply").setDescription("Apply for a career.")
        .addStringOption((o) => o.setName("career").setDescription("Career to apply for").setRequired(true).addChoices(...balancing.jobs.map((j) => ({ name: j.name, value: j.id }))))),
    async execute(i, s) {
      if (i.options.getSubcommand() === "apply") {
        const r = await s.jobs.apply(i.guildId, i.user.id, i.options.getString("career"));
        return respond(i, { kind: "success", title: "Career Updated", description: "You are now a **" + r.job.name + "**. " + r.job.description });
      }
      const r = await s.jobs.view(i.guildId, i.user.id);
      const current = r.job ? r.job.name + " (Level " + r.player.job_level + ")" : "Unemployed";
      const list = r.jobs.map((j) => "**" + j.name + "** — level " + j.minLevel + "+, " + j.minWallet.toLocaleString() + " FC required.\n" + j.description).join("\n\n");
      return respond(i, { title: "Career Paths", description: "Current job: **" + current + "**\nApply with /job apply.", fields: [{ name: "Available jobs", value: list.slice(0, 1024) }] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("profile").setDescription("View player progress.")
      .addUserOption((o) => o.setName("member").setDescription("Member to view").setRequired(false)),
    async execute(i, s) {
      const target = i.options.getUser("member") || i.user;
      const p = await getPlayer(s.pool, i.guildId, target.id);
      const job = balancing.jobs.find((x) => x.id === p.job_id);
      return respond(i, { icon: "profile", title: target.username + " — Fukishokai Profile", description: "Your progress across the clan's game systems.",
        fields: [
          { name: "Player level", value: String(p.level) + " (" + Number(p.xp).toLocaleString() + "/" + levelXpRequired(Number(p.level)).toLocaleString() + " XP)", inline: true },
          { name: "Career", value: job ? job.name + " • Level " + p.job_level : "Unemployed", inline: true },
          { name: "Wealth", value: (Number(p.wallet) + Number(p.bank)).toLocaleString() + " FC", inline: true },
          { name: "Lifetime earned", value: Number(p.lifetime_earned).toLocaleString() + " FC", inline: true },
          { name: "Successful crimes", value: Number(p.crime_successes).toLocaleString(), inline: true },
          { name: "Heists completed", value: Number(p.heists_completed).toLocaleString(), inline: true }
        ] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("leaderboard").setDescription("View Fukishokai game rankings.")
      .addStringOption((o) => o.setName("type").setDescription("Ranking type").setRequired(false).addChoices(
        { name: "Wealth", value: "wealth" }, { name: "Level", value: "level" }, { name: "Lifetime earned", value: "earned" }, { name: "Weekly activity", value: "activity" })),
    async execute(i, s) {
      const type = i.options.getString("type") || "wealth";
      if (type === "activity") {
        const activity = await s.activity.leaderboard(i.guildId, 10);
        const lines = activity.rows.map((row, index) => "**" + (index + 1) + ".** <@" + row.user_id + "> — " + Number(row.messages).toLocaleString() + " messages");
        return respond(i, { icon: "leaderboard", title: "Weekly Activity Leaderboard", description: lines.length ? "Week starting " + activity.weekStart + "\n\n" + lines.join("\n") : "No tracked messages this week yet." });
      }
      const rows = await getLeaderboard(s.pool, i.guildId, type, 10);
      if (!rows.length) return respond(i, { icon: "leaderboard", title: "Leaderboard", description: "No players are ranked yet." });
      const lines = rows.map((row, index) => "**" + (index + 1) + ".** <@" + row.user_id + "> — " +
        (type === "level" ? "Level " + row.score : Number(row.score).toLocaleString() + (type === "wealth" ? " FC" : " FC earned")));
      return respond(i, { icon: "leaderboard", title: "Fukishokai Leaderboard", description: lines.join("\n") });
    }
  },
  {
    data: new SlashCommandBuilder().setName("transfer").setDescription("Send FS Coins to another member.")
      .addUserOption((o) => o.setName("member").setDescription("Recipient").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("Amount to send").setRequired(true).setMinValue(1).setMaxValue(500000)),
    async execute(i, s) {
      const target = i.options.getUser("member");
      const r = await s.economy.transfer(i.guildId, i.user.id, target.id, i.options.getInteger("amount"));
      return respond(i, { kind: "success", title: "Transfer Complete", description: "Sent **" + r.amount.toLocaleString() + " FC** to " + target.username + "." });
    }
  },
  {
    data: new SlashCommandBuilder().setName("inventory").setDescription("View your inventory and equipped gear."),
    async execute(i, s) {
      const r = await s.inventory.getInventory(i.guildId, i.user.id);
      const owned = r.items.map((x) => "**" + x.item.name + "** × " + x.quantity + (x.equipped ? " • EQUIPPED" : ""));
      const gear = r.equipped.map((x) => "**" + x.slot + ":** " + x.item.name);
      return respond(i, { title: "Inventory & Equipment", description: (owned.length ? owned.join("\n") : "Your inventory is empty.") + "\n\n**Equipped gear**\n" + (gear.length ? gear.join("\n") : "Nothing equipped yet.") });
    }
  },

  {
    data: new SlashCommandBuilder().setName("shop").setDescription("Browse or buy Fukishokai equipment.")
      .addSubcommand((s) => s.setName("view").setDescription("View available equipment."))
      .addSubcommand((s) =>
        s.setName("buy").setDescription("Buy equipment using FS Coins.")
          .addStringOption((o) =>
            o.setName("item").setDescription("Item to buy").setRequired(true)
              .addChoices(...balancing.items.map((item) => ({
                name: item.name + " — " + item.cost.toLocaleString() + " FC",
                value: item.id
              })))
          )
      ),
    async execute(i, s) {
      if (i.options.getSubcommand() === "buy") {
        const r = await s.inventory.buy(i.guildId, i.user.id, i.options.getString("item"));
        return respond(i, { kind: "success", title: "Purchase Complete", description: "You bought **" + r.item.name + "**.\n" + r.item.description + "\nWallet remaining: **" + r.walletRemaining.toLocaleString() + " FC**." });
      }
      const lines = balancing.items.map((item) => "**" + item.name + "** — " + item.cost.toLocaleString() + " FC • Level " + item.minLevel + "+\nSlot: " + item.slot + "\n" + item.description);
      return respond(i, { title: "Equipment Shop", description: "Compare the level requirement and bonus before buying. Use /shop buy to purchase an item.\n\n" + lines.join("\n\n").slice(0, 3900) });
    }
  },
  {
    data: new SlashCommandBuilder().setName("equip").setDescription("Equip an item you own.")
      .addStringOption((o) =>
        o.setName("item").setDescription("Equipment to equip").setRequired(true)
          .addChoices(...balancing.items
            .filter((item) => item.type === "equipment")
            .map((item) => ({ name: item.name, value: item.id })))
      ),
    async execute(i, s) {
      const r = await s.inventory.equip(i.guildId, i.user.id, i.options.getString("item"));
      return respond(i, { kind: "success", title: "Equipment Updated", description: "Equipped **" + r.item.name + "** in your **" + r.item.slot + "** slot." + (r.previousItem ? "\nReplaced: " + r.previousItem.name : "") });
    }
  },
  {
    data: new SlashCommandBuilder().setName("unequip").setDescription("Remove gear from an equipment slot.")
      .addStringOption((o) => o.setName("slot").setDescription("Slot to clear").setRequired(true).addChoices(
        { name: "Hands", value: "hands" }, { name: "Outfit", value: "outfit" },
        { name: "Gadget", value: "gadget" }, { name: "Armor", value: "armor" },
        { name: "Vehicle", value: "vehicle" }, { name: "Bag", value: "bag" }, { name: "Charm", value: "charm" }
      )),
    async execute(i, s) {
      const r = await s.inventory.unequip(i.guildId, i.user.id, i.options.getString("slot"));
      return respond(i, { kind: "success", title: "Gear Unequipped", description: "Removed **" + r.item.name + "** from your " + r.slot + " slot. The item remains in your inventory." });
    }
  },
  {
    data: new SlashCommandBuilder().setName("crime").setDescription("Attempt a risky crime for a possible payout.")
      .addStringOption((o) => o.setName("type").setDescription("Crime type").setRequired(true).addChoices(...balancing.crimes.map((c) => ({ name: c.name, value: c.id })))),
    async execute(i, s) {
      const r = await s.crime.attempt(i.guildId, i.user.id, i.options.getString("type"), interactionRoleIds(i));
      if (r.succeeded) return respond(i, { kind: "success", title: r.crime.name + " — Success", description: "You earned **" + r.reward.toLocaleString() + " FC**.", fields: [{ name: "Success chance", value: r.successChance + "%", inline: true }] });
      return respond(i, { kind: "warning", title: r.crime.name + " — Caught", description: "The attempt failed. You lost **" + r.fine.toLocaleString() + " FC** in fines.", fields: [{ name: "Success chance", value: r.successChance + "%", inline: true }] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("casino").setDescription("Play casino games using virtual FS Coins.")
      .addStringOption((o) => o.setName("game").setDescription("Game to play").setRequired(true).addChoices(
        { name: "Coin Flip", value: "coinflip" }, { name: "High Dice", value: "dice" }, { name: "Slots", value: "slots" }))
      .addIntegerOption((o) => o.setName("bet").setDescription("Amount of FC to bet").setRequired(true).setMinValue(100).setMaxValue(100000)),
    async execute(i, s) {
      const r = await s.casino.play(i.guildId, i.user.id, i.options.getString("game"), i.options.getInteger("bet"));
      return respond(i, { kind: r.won ? "success" : "warning", title: r.game.name + " — " + (r.won ? "Win" : "Loss"), description: r.outcome,
        fields: [
          { name: "Bet", value: r.wager.toLocaleString() + " FC", inline: true },
          { name: "Payout", value: r.payout.toLocaleString() + " FC", inline: true },
          { name: "Net", value: (r.net > 0 ? "+" : "") + r.net.toLocaleString() + " FC", inline: true }
        ] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("heist").setDescription("Plan and run cooperative heists.")
      .addSubcommand((s) => s.setName("missions").setDescription("View available missions."))
      .addSubcommand((s) => s.setName("create").setDescription("Start recruiting a crew.").addStringOption((o) => o.setName("mission").setDescription("Mission").setRequired(true).addChoices(...balancing.heists.map((m) => ({ name: m.name, value: m.id })))))
      .addSubcommand((s) => s.setName("join").setDescription("Join a recruiting crew.").addStringOption((o) => o.setName("id").setDescription("Heist ID").setRequired(true)).addStringOption((o) => o.setName("role").setDescription("Crew role").setRequired(true).addChoices(...Object.entries(balancing.heistRoles).map(([value, r]) => ({ name: r.label, value })))))
      .addSubcommand((s) => s.setName("start").setDescription("Run a heist as its leader.").addStringOption((o) => o.setName("id").setDescription("Heist ID").setRequired(true)))
      .addSubcommand((s) => s.setName("status").setDescription("View a heist and its crew.").addStringOption((o) => o.setName("id").setDescription("Heist ID").setRequired(true))),
    async execute(i, s) {
      const action = i.options.getSubcommand();
      if (action === "missions") {
        return respond(i, { title: "Heist Missions", description: balancing.heists.map((m) => "**" + m.name + "** — level " + m.minLevel + "+, crew " + m.minParticipants + "-" + m.maxParticipants + ", base chance " + m.baseChance + "%.\n" + m.description).join("\n\n") });
      }
      if (action === "create") {
        const r = await s.heists.create(i.guildId, i.user.id, i.options.getString("mission"));
        return respond(i, { kind: "success", title: "Recruiting: " + r.mission.name, description: "Heist ID: **" + r.id + "**\nShare the ID with your crew, let them join, then use /heist start.",
          fields: [
            { name: "Crew size", value: r.mission.minParticipants + "-" + r.mission.maxParticipants, inline: true },
            { name: "Potential payout", value: r.mission.payoutMin.toLocaleString() + "-" + r.mission.payoutMax.toLocaleString() + " FC", inline: true },
            { name: "Difficulty", value: String(r.mission.difficulty), inline: true }
          ] });
      }
      const id = i.options.getString("id");
      if (action === "join") {
        const r = await s.heists.join(i.guildId, i.user.id, id, i.options.getString("role"));
        return respond(i, { kind: "success", title: "Crew Joined", description: "You joined **" + r.mission.name + "** as **" + r.role.label + "**. Crew: " + r.count + "/" + r.maximum + "." });
      }
      if (action === "start") {
        const roleIdsByUser = new Map();
        const boosterRoleId = await s.guildSettings.get(i.guildId, "xpBoosterRoleId");
        if (boosterRoleId) {
          const participants = await s.pool.query(
            "SELECT user_id FROM heist_participants WHERE guild_id = $1 AND heist_id = $2",
            [i.guildId, id]
          );
          await Promise.all(participants.rows.map(async (participant) => {
            const member = await i.guild.members.fetch(participant.user_id);
            roleIdsByUser.set(participant.user_id, member.roles.cache.has(boosterRoleId) ? [boosterRoleId] : []);
          }));
        }
        const r = await s.heists.start(i.guildId, i.user.id, id, roleIdsByUser);
        const crew = r.crew.map((m) => "<@" + m.userId + "> — " + balancing.heistRoles[m.role].label).join("\n");
        return respond(i, { kind: r.succeeded ? "success" : "warning", title: r.mission.name + " — " + (r.succeeded ? "Completed" : "Failed"),
          description: "Chance: " + r.successChance + "% • Roll: " + r.roll + "\n" + (r.succeeded ? "Crew payout: **" + r.totalPayout.toLocaleString() + " FC**, shared by the team." : "The crew was caught. Failure penalties were applied."),
          fields: [{ name: "Crew", value: crew.slice(0, 1024) }] });
      }
      const r = await s.heists.status(i.guildId, id);
      const mission = balancing.heists.find((m) => m.id === r.heist.mission_id);
      const crew = r.crew.map((m) => "<@" + m.user_id + "> — " + balancing.heistRoles[m.role_id].label).join("\n") || "No members";
      return respond(i, { title: "Heist Status", description: "**" + (mission ? mission.name : r.heist.mission_id) + "**\nID: " + r.heist.id + "\nStatus: " + r.heist.status + "\nCrew: " + r.heist.crew_count, fields: [{ name: "Members", value: crew.slice(0, 1024) }] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("event").setDescription("View and progress through Halloween.")
      .addSubcommand((s) => s.setName("status").setDescription("View event balance and progress."))
      .addSubcommand((s) => s.setName("quests").setDescription("View your Halloween quests."))
      .addSubcommand((s) => s.setName("weekly").setDescription("Check your 1,000-message Halloween mission."))
      .addSubcommand((s) => s.setName("weekly-claim").setDescription("Claim the weekly message mission reward."))
      .addSubcommand((s) => s.setName("claim").setDescription("Claim a completed quest.").addStringOption((o) => o.setName("quest").setDescription("Quest").setRequired(true).addChoices(...balancing.halloween.quests.map((q) => ({ name: q.name, value: q.id })))))
      .addSubcommand((s) => s.setName("shop").setDescription("View seasonal collectibles."))
      .addSubcommand((s) => s.setName("buy").setDescription("Buy a collectible.").addStringOption((o) => o.setName("item").setDescription("Item").setRequired(true).addChoices(...balancing.halloween.shop.map((item) => ({ name: item.name + " — " + item.cost + " Candy", value: item.id }))))),
    async execute(i, s) {
      const action = i.options.getSubcommand();
      if (action === "weekly") {
        const weekly = await s.activity.getWeekly(i.guildId, i.user.id);
        const event = await s.halloween.getEvent(i.guildId);
        const active = event && event.enabled && new Date(event.starts_at).getTime() <= Date.now() && new Date(event.ends_at).getTime() > Date.now();
        return respond(i, {
          icon: "task",
          title: "Weekly Halloween Mission",
          description: "Reach **" + weekly.goal.toLocaleString() + " eligible messages** during the week starting " + weekly.weekStart + ".\n\nYour progress: **" + weekly.messages.toLocaleString() + "/" + weekly.goal.toLocaleString() + "** messages.\n\nReward: **" + balancing.halloween.weeklyMessageCandyReward + " Candy** and " + balancing.halloween.weeklyMessagePointsReward + " event points." + (active ? "\n\nUse /event weekly-claim when you reach the goal." : "\n\nThe Halloween event must be active to claim the reward.")
        });
      }
      if (action === "weekly-claim") {
        const r = await s.halloween.claimWeeklyActivity(i.guildId, i.user.id, s.activity);
        if (r.eligibleForRole && r.roleId) {
          try {
            const member = await i.guild.members.fetch(i.user.id);
            await member.roles.add(r.roleId, "Completed the weekly Halloween activity mission");
          } catch (error) {
            console.warn("[event] Weekly activity role could not be added:", error.message);
          }
        }
        return respond(i, { kind: "success", icon: "task", title: "Weekly Mission Complete", description: "You reached " + r.messages.toLocaleString() + " eligible messages and received **" + r.candy + " Candy** plus " + r.points + " event points. Claims toward the final role: " + r.claimedCount + "/" + balancing.halloween.finalRoleQuestCount + "." });
      }
      if (action === "status" || action === "quests") {
        const r = await s.halloween.status(i.guildId, i.user.id);
        if (!r.event) return respond(i, { icon: "task", title: "Halloween Event", description: "An administrator needs to start the event in this server." });
        const progress = new Map(r.progress.map((x) => [x.quest_id, Number(x.progress)]));
        const claims = new Set(r.claims);
        const lines = r.quests.map((q) => "**" + q.name + "** — " + Math.min(q.goal, progress.get(q.id) || 0) + "/" + q.goal + (claims.has(q.id) ? " • CLAIMED" : "") + "\n" + q.description + " Reward: " + q.candy + " Candy.");
        if (action === "quests") return respond(i, { icon: "task", title: "Halloween Quests", description: lines.join("\n\n").slice(0, 4000) });
        return respond(i, { icon: "task", title: "Fukishokai Halloween", description: (r.active ? "Event is active." : "Event is not active.") + "\nEnds <t:" + Math.floor(new Date(r.event.ends_at).getTime() / 1000) + ":R>\n\n**Candy:** " + Number(r.wallet.candy || 0).toLocaleString() + "\n**Points:** " + Number(r.wallet.points || 0).toLocaleString(),
          fields: [{ name: "Quests", value: lines.slice(0, 3).join("\n\n").slice(0, 1024) }] });
      }
      if (action === "claim") {
        const r = await s.halloween.claimQuest(i.guildId, i.user.id, i.options.getString("quest"));
        if (r.eligibleForRole && r.roleId) {
          try {
            const member = await i.guild.members.fetch(i.user.id);
            await member.roles.add(r.roleId, "Completed the Halloween quest requirement");
          } catch (error) {
            console.warn("[event] Event role could not be added:", error.message);
          }
        }
        return respond(i, { kind: "success", icon: "task", title: "Quest Claimed", description: "**" + r.quest.name + "** completed. You received **" + r.quest.candy + " Candy** and " + r.quest.points + " points." });
      }
      if (action === "shop") return respond(i, { icon: "task", title: "Halloween Shop", description: balancing.halloween.shop.map((item) => "**" + item.name + "** — " + item.cost + " Candy\n" + item.description).join("\n\n") });
      const r = await s.halloween.buyItem(i.guildId, i.user.id, i.options.getString("item"));
      return respond(i, { kind: "success", icon: "task", title: "Purchase Complete", description: "You bought **" + r.item.name + "**.\n" + r.item.description + "\nCandy remaining: **" + r.remainingCandy.toLocaleString() + "**." });
    }
  },
  {
    data: new SlashCommandBuilder().setName("admin").setDescription("Authorized economy and Halloween controls.")
      .addSubcommand((s) => s.setName("panel").setDescription("View the private server admin panel."))
      .addSubcommand((s) => s.setName("grant").setDescription("Grant FS Coins or XP.").addUserOption((o) => o.setName("member").setDescription("Member to update").setRequired(true)).addStringOption((o) => o.setName("type").setDescription("Resource to grant").setRequired(true).addChoices({ name: "FS Coins", value: "coins" }, { name: "XP", value: "xp" })).addIntegerOption((o) => o.setName("amount").setDescription("Amount to grant").setRequired(true).setMinValue(1).setMaxValue(10000000)).addStringOption((o) => o.setName("reason").setDescription("Audit reason").setRequired(true).setMaxLength(500)))
      .addSubcommand((s) => s.setName("remove").setDescription("Remove FS Coins.").addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true)).addIntegerOption((o) => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1).setMaxValue(10000000)).addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true)))
      .addSubcommand((s) => s.setName("set-level").setDescription("Set a player level directly.").addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true)).addIntegerOption((o) => o.setName("level").setDescription("New player level").setRequired(true).setMinValue(1).setMaxValue(100)).addStringOption((o) => o.setName("reason").setDescription("Audit reason").setRequired(true).setMaxLength(500)))
      .addSubcommand((s) => s.setName("set-job").setDescription("Assign a career and job level.").addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true)).addStringOption((o) => o.setName("career").setDescription("Career to assign").setRequired(true).addChoices(...balancing.jobs.map((j) => ({ name: j.name, value: j.id })))).addIntegerOption((o) => o.setName("job-level").setDescription("Job level (defaults to 1)").setRequired(false).setMinValue(1).setMaxValue(100)).addStringOption((o) => o.setName("reason").setDescription("Audit reason").setRequired(true).setMaxLength(500)))
      .addSubcommand((s) => s.setName("leaderboard-exclude").setDescription("Exclude a member from all competitive leaderboards.").addUserOption((o) => o.setName("member").setDescription("Member to exclude").setRequired(true)).addStringOption((o) => o.setName("reason").setDescription("Reason for exclusion").setRequired(true).setMaxLength(500)))
      .addSubcommand((s) => s.setName("leaderboard-include").setDescription("Restore a member's leaderboard eligibility.").addUserOption((o) => o.setName("member").setDescription("Member to restore").setRequired(true)))
      .addSubcommand((s) => s.setName("event-start").setDescription("Start the Halloween event.").addRoleOption((o) => o.setName("role").setDescription("Final reward role").setRequired(false)))
      .addSubcommand((s) => s.setName("event-stop").setDescription("Stop the Halloween event.")),
    async execute(i, s) {
      if (!await adminAllowed(i, s.guildSettings)) return respond(i, { kind: "error", ephemeral: true, icon: "failed", title: "Permission Denied", description: "You need Manage Server, Administrator, or the configured admin role." });
      const action = i.options.getSubcommand();
      if (action === "panel") {
        const panel = await adminPanel(i, s);
        return respond(i, panel);
      }
      if (action === "leaderboard-exclude" || action === "leaderboard-include") {
        if (!ownerAllowed(i)) return respond(i, { kind: "error", ephemeral: true, icon: "failed", title: "Owner Only", description: "Only the server owner or configured bot owner can change leaderboard eligibility." });
        const target = i.options.getUser("member");
        if (action === "leaderboard-exclude") {
          const reason = i.options.getString("reason");
          await s.economy.excludeFromLeaderboards(i.guildId, target.id, i.user.id, reason);
          await audit(s.pool, i.guildId, i.user.id, "leaderboard_member_excluded", target.id, { reason });
          await sendLog(i.client, i.guildId, "Leaderboard exclusion by <@" + i.user.id + "> for <@" + target.id + ">: " + reason);
          return respond(i, { kind: "success", title: "Member Excluded", description: target.username + " has been excluded from all competitive leaderboards. Their balance and progress have not been changed." });
        }
        const result = await s.economy.includeInLeaderboards(i.guildId, target.id);
        await audit(s.pool, i.guildId, i.user.id, "leaderboard_member_included", target.id, {});
        await sendLog(i.client, i.guildId, "Leaderboard eligibility restored by <@" + i.user.id + "> for <@" + target.id + ">.");
        return respond(i, { kind: "success", title: "Member Restored", description: result.included ? target.username + " is eligible for leaderboards again." : target.username + " was not excluded." });
      }
      if (["grant", "remove", "set-level", "set-job"].includes(action)) {
        if (!ownerAllowed(i)) return respond(i, { kind: "error", ephemeral: true, icon: "failed", title: "Owner Only", description: "Only the server owner or configured bot owner can edit player money, XP, levels, or careers." });
        const target = i.options.getUser("member");
        const reason = i.options.getString("reason");

        if (action === "grant") {
          const amount = i.options.getInteger("amount");
          const type = i.options.getString("type");
          if (type === "coins") {
            await s.economy.transact(async (client) => {
              await s.economy.mutateTx(client, i.guildId, target.id, amount, "admin_grant", uuid(), { actorId: i.user.id, reason, resource: "coins" });
            });
            await audit(s.pool, i.guildId, i.user.id, "admin_grant_coins", target.id, { amount, reason });
            await sendLog(i.client, i.guildId, "FS Coins granted by <@" + i.user.id + "> to <@" + target.id + "> (" + amount.toLocaleString() + " FC): " + reason);
            return respond(i, { kind: "success", icon: "settings", title: "FS Coins Granted", description: "Granted **" + amount.toLocaleString() + " FC** to " + target.username + ".", fields: [{ name: "Reason", value: reason }] });
          }

          const progression = await s.economy.transact(async (client) => {
            await s.economy.ensurePlayerTx(client, i.guildId, target.id);
            const current = await client.query("SELECT level, xp FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [i.guildId, target.id]);
            let level = Number(current.rows[0].level);
            let xp = Number(current.rows[0].xp) + amount;
            let levelsGained = 0;
            while (level < 100 && xp >= levelXpRequired(level)) {
              xp -= levelXpRequired(level);
              level += 1;
              levelsGained += 1;
            }
            if (level >= 100) xp = 0;
            await client.query("UPDATE players SET level = $3, xp = $4, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, target.id, level, xp]);
            return { level, xp, levelsGained };
          });
          await audit(s.pool, i.guildId, i.user.id, "admin_grant_xp", target.id, { amount, reason, newLevel: progression.level, levelsGained: progression.levelsGained });
          await sendLog(i.client, i.guildId, "XP granted by <@" + i.user.id + "> to <@" + target.id + "> (" + amount.toLocaleString() + " XP): " + reason);
          return respond(i, { kind: "success", icon: "settings", title: "XP Granted", description: "Granted **" + amount.toLocaleString() + " XP** to " + target.username + ". Current level: **" + progression.level + "**." + (progression.levelsGained ? " Levels gained: " + progression.levelsGained + "." : ""), fields: [{ name: "Reason", value: reason }] });
        }

        if (action === "remove") {
          const amount = i.options.getInteger("amount");
          await s.economy.transact(async (client) => {
            await s.economy.mutateTx(client, i.guildId, target.id, -amount, "admin_remove", uuid(), { actorId: i.user.id, reason });
          });
          await audit(s.pool, i.guildId, i.user.id, "economy_remove", target.id, { amount: -amount, reason });
          await sendLog(i.client, i.guildId, "FS Coins removed by <@" + i.user.id + "> from <@" + target.id + "> (" + amount.toLocaleString() + " FC): " + reason);
          return respond(i, { kind: "success", icon: "settings", title: "FS Coins Removed", description: "Removed **" + amount.toLocaleString() + " FC** from " + target.username + ".", fields: [{ name: "Reason", value: reason }] });
        }

        if (action === "set-level") {
          const level = i.options.getInteger("level");
          await s.economy.transact(async (client) => {
            await s.economy.ensurePlayerTx(client, i.guildId, target.id);
            await client.query("UPDATE players SET level = $3, xp = 0, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, target.id, level]);
          });
          await audit(s.pool, i.guildId, i.user.id, "admin_set_level", target.id, { level, reason });
          await sendLog(i.client, i.guildId, "Player level set by <@" + i.user.id + "> for <@" + target.id + "> to level " + level + ": " + reason);
          return respond(i, { kind: "success", icon: "settings", title: "Player Level Updated", description: "Set " + target.username + "'s player level to **" + level + "** and reset current-level XP to 0.", fields: [{ name: "Reason", value: reason }] });
        }

        const career = i.options.getString("career");
        const job = balancing.jobs.find((entry) => entry.id === career);
        if (!job) return respond(i, { kind: "error", ephemeral: true, icon: "failed", title: "Invalid Career", description: "That career is not available." });
        const jobLevel = i.options.getInteger("job-level") || 1;
        await s.economy.transact(async (client) => {
          await s.economy.ensurePlayerTx(client, i.guildId, target.id);
          await client.query("UPDATE players SET job_id = $3, job_level = $4, job_xp = 0, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, target.id, career, jobLevel]);
        });
        await audit(s.pool, i.guildId, i.user.id, "admin_set_job", target.id, { career, jobLevel, reason });
        await sendLog(i.client, i.guildId, "Career set by <@" + i.user.id + "> for <@" + target.id + "> to " + job.name + " level " + jobLevel + ": " + reason);
        return respond(i, { kind: "success", icon: "settings", title: "Career Updated", description: "Assigned **" + job.name + " · Level " + jobLevel + "** to " + target.username + ".", fields: [{ name: "Reason", value: reason }] });
      }
      if (action === "event-start") {
        const role = i.options.getRole("role");
        const result = await s.halloween.startEvent(i.guildId, i.user.id, role ? role.id : null);
        await audit(s.pool, i.guildId, i.user.id, "halloween_event_started", null, { eventId: result.eventId, roleId: result.roleId, endsAt: result.endsAt });
        await sendLog(i.client, i.guildId, "Halloween event started by <@" + i.user.id + ">.");
        return respond(i, { kind: "success", icon: "settings", title: "Halloween Event Started", description: "The event is now active and ends <t:" + Math.floor(result.endsAt.getTime() / 1000) + ":R>." });
      }
      const result = await s.halloween.stopEvent(i.guildId, i.user.id);
      await audit(s.pool, i.guildId, i.user.id, "halloween_event_stopped", null, { eventId: result.eventId });
      await sendLog(i.client, i.guildId, "Halloween event stopped by <@" + i.user.id + ">.");
      return respond(i, { kind: "warning", icon: "settings", title: "Halloween Event Stopped", description: "The event has been disabled for this server." });
    }
  }
];

function loadCommands() {
  const map = new Map();
  for (const command of commands) {
    if (map.has(command.data.name)) throw new Error("Duplicate command name: " + command.data.name);
    map.set(command.data.name, command);
  }
  return map;
}
module.exports = { loadCommands, handleAdminPanelComponent, adminPanel };
