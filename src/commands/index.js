const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const settings = require("../config/settings");
const balancing = require("../config/game-balancing");
const { respond } = require("../ui");
const { getPlayer, getLeaderboard } = require("../services/economy");
const { DomainError, uuid, levelXpRequired } = require("../utils/core");
const { audit } = require("../utils/logging");

function adminAllowed(interaction) {
  if (settings.ownerId && interaction.user.id === settings.ownerId) return true;
  if (interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const roles = interaction.member && interaction.member.roles && interaction.member.roles.cache;
  return Boolean(roles && settings.adminRoleIds.some((id) => roles.has(id)));
}

const commands = [
  {
    data: new SlashCommandBuilder().setName("balance").setDescription("Check your or another member's Fuk Coins.")
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
    data: new SlashCommandBuilder().setName("bank").setDescription("Deposit or withdraw Fuk Coins.")
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
    data: new SlashCommandBuilder().setName("daily").setDescription("Claim your daily Fuk Coins and XP."),
    async execute(i, s) {
      const r = await s.economy.daily(i.guildId, i.user.id);
      const levelText = r.progression.levelsGained ? " You reached level " + r.progression.level + "!" : "";
      return respond(i, { kind: "success", title: "Daily Reward Claimed", description: "You received **" + r.amount.toLocaleString() + " FC**." + levelText, fields: [{ name: "XP gained", value: String(r.progression.gained), inline: true }] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("work").setDescription("Complete a shift at your current job."),
    async execute(i, s) {
      const r = await s.jobs.work(i.guildId, i.user.id);
      const promotion = r.promoted ? " Your job level increased to " + r.jobLevel + "!" : "";
      const levels = r.progression.levelsGained ? " You reached player level " + r.progression.level + "!" : "";
      return respond(i, { kind: "success", title: r.job.name + " — Shift Complete", description: "You earned **" + r.pay.toLocaleString() + " FC**." + promotion + levels,
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
      return respond(i, { title: target.username + " — Fukishokai Profile", description: "Your progress across the clan's game systems.",
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
        return respond(i, { title: "Weekly Activity Leaderboard", description: lines.length ? "Week starting " + activity.weekStart + "\n\n" + lines.join("\n") : "No tracked messages this week yet." });
      }
      const rows = await getLeaderboard(s.pool, i.guildId, type, 10);
      if (!rows.length) return respond(i, { title: "Leaderboard", description: "No players are ranked yet." });
      const lines = rows.map((row, index) => "**" + (index + 1) + ".** <@" + row.user_id + "> — " +
        (type === "level" ? "Level " + row.score : Number(row.score).toLocaleString() + (type === "wealth" ? " FC" : " FC earned")));
      return respond(i, { title: "Fukishokai Leaderboard", description: lines.join("\n") });
    }
  },
  {
    data: new SlashCommandBuilder().setName("transfer").setDescription("Send Fuk Coins to another member.")
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
      .addSubcommand((s) => s.setName("buy").setDescription("Buy equipment using Fuk Coins.")
        .addStringOption((o) => o.setName("item").setDescription("Item to buy").setRequired(true)
          .addChoices(...balancing.items.map((item) => ({ name: item.name + " — " + item.cost.toLocaleString() + " FC", value: item.id }))))),
    async execute(i, s) {
      if (i.options.getSubcommand() === "buy") {
        const r = await s.inventory.buy(i.guildId, i.user.id, i.options.getString("item"));
        return respond(i, { kind: "success", title: "Purchase Complete", description: "You bought **" + r.item.name + "**.\\n" + r.item.description + "\\nWallet remaining: **" + r.walletRemaining.toLocaleString() + " FC**." });
      }
      const lines = balancing.items.map((item) => "**" + item.name + "** — " + item.cost.toLocaleString() + " FC • Level " + item.minLevel + "+\\nSlot: " + item.slot + "\\n" + item.description);
      return respond(i, { title: "Fukishokai Equipment Shop", description: lines.join("\\n\\n").slice(0, 4000) });
    }
  },
  {
    data: new SlashCommandBuilder().setName("equip").setDescription("Equip an item you own.")
      .addStringOption((o) => o.setName("item").setDescription("Equipment to equip").setRequired(true)
        .addChoices(...balancing.items.filter((item) => item.type === "equipment").map((item) => ({ name: item.name, value: item.id })))),
    async execute(i, s) {
      const r = await s.inventory.equip(i.guildId, i.user.id, i.options.getString("item"));
      return respond(i, { kind: "success", title: "Equipment Updated", description: "Equipped **" + r.item.name + "** in your **" + r.item.slot + "** slot." + (r.previousItem ? "\\nReplaced: " + r.previousItem.name : "") });
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
      const r = await s.crime.attempt(i.guildId, i.user.id, i.options.getString("type"));
      if (r.succeeded) return respond(i, { kind: "success", title: r.crime.name + " — Success", description: "You earned **" + r.reward.toLocaleString() + " FC**.", fields: [{ name: "Success chance", value: r.successChance + "%", inline: true }] });
      return respond(i, { kind: "warning", title: r.crime.name + " — Caught", description: "The attempt failed. You lost **" + r.fine.toLocaleString() + " FC** in fines.", fields: [{ name: "Success chance", value: r.successChance + "%", inline: true }] });
    }
  },
  {
    data: new SlashCommandBuilder().setName("casino").setDescription("Play casino games using virtual Fuk Coins.")
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
        const r = await s.heists.start(i.guildId, i.user.id, id);
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
        return respond(i, { kind: "success", title: "Weekly Mission Complete", description: "You reached " + r.messages.toLocaleString() + " eligible messages and received **" + r.candy + " Candy** plus " + r.points + " event points. Claims toward the final role: " + r.claimedCount + "/" + balancing.halloween.finalRoleQuestCount + "." });
      }
      if (action === "status" || action === "quests") {
        const r = await s.halloween.status(i.guildId, i.user.id);
        if (!r.event) return respond(i, { title: "Halloween Event", description: "An administrator needs to start the event in this server." });
        const progress = new Map(r.progress.map((x) => [x.quest_id, Number(x.progress)]));
        const claims = new Set(r.claims);
        const lines = r.quests.map((q) => "**" + q.name + "** — " + Math.min(q.goal, progress.get(q.id) || 0) + "/" + q.goal + (claims.has(q.id) ? " • CLAIMED" : "") + "\n" + q.description + " Reward: " + q.candy + " Candy.");
        if (action === "quests") return respond(i, { title: "Halloween Quests", description: lines.join("\n\n").slice(0, 4000) });
        return respond(i, { title: "Fukishokai Halloween", description: (r.active ? "Event is active." : "Event is not active.") + "\nEnds <t:" + Math.floor(new Date(r.event.ends_at).getTime() / 1000) + ":R>\n\n**Candy:** " + Number(r.wallet.candy || 0).toLocaleString() + "\n**Points:** " + Number(r.wallet.points || 0).toLocaleString(),
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
        return respond(i, { kind: "success", title: "Quest Claimed", description: "**" + r.quest.name + "** completed. You received **" + r.quest.candy + " Candy** and " + r.quest.points + " points." });
      }
      if (action === "shop") return respond(i, { title: "Halloween Shop", description: balancing.halloween.shop.map((item) => "**" + item.name + "** — " + item.cost + " Candy\n" + item.description).join("\n\n") });
      const r = await s.halloween.buyItem(i.guildId, i.user.id, i.options.getString("item"));
      return respond(i, { kind: "success", title: "Purchase Complete", description: "You bought **" + r.item.name + "**.\n" + r.item.description + "\nCandy remaining: **" + r.remainingCandy.toLocaleString() + "**." });
    }
  },
  {
    data: new SlashCommandBuilder().setName("admin").setDescription("Authorized economy and Halloween controls.")
      .addSubcommand((s) => s.setName("grant").setDescription("Grant Fuk Coins.").addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true)).addIntegerOption((o) => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1).setMaxValue(10000000)).addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true)))
      .addSubcommand((s) => s.setName("remove").setDescription("Remove Fuk Coins.").addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true)).addIntegerOption((o) => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1).setMaxValue(10000000)).addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true)))
      .addSubcommand((s) => s.setName("event-start").setDescription("Start the Halloween event.").addRoleOption((o) => o.setName("role").setDescription("Final reward role").setRequired(false)))
      .addSubcommand((s) => s.setName("event-stop").setDescription("Stop the Halloween event.")),
    async execute(i, s) {
      if (!adminAllowed(i)) return respond(i, { kind: "error", ephemeral: true, title: "Permission Denied", description: "You need Manage Server, an approved admin role, or the configured owner ID." });
      const action = i.options.getSubcommand();
      if (action === "grant" || action === "remove") {
        const target = i.options.getUser("member");
        const amount = i.options.getInteger("amount") * (action === "grant" ? 1 : -1);
        const reason = i.options.getString("reason");
        await s.economy.transact(async (client) => {
          await s.economy.mutateTx(client, i.guildId, target.id, amount, "admin_" + action, uuid(), { actorId: i.user.id, reason });
        });
        await audit(s.pool, i.guildId, i.user.id, "economy_" + action, target.id, { amount, reason });
        return respond(i, { kind: "success", title: "Economy Updated", description: (action === "grant" ? "Granted " : "Removed ") + Math.abs(amount).toLocaleString() + " FC " + (action === "grant" ? "to " : "from ") + target.username + ".", fields: [{ name: "Reason", value: reason }] });
      }
      if (action === "event-start") {
        const role = i.options.getRole("role");
        const result = await s.halloween.startEvent(i.guildId, i.user.id, role ? role.id : null);
        await audit(s.pool, i.guildId, i.user.id, "halloween_event_started", null, { eventId: result.eventId, roleId: result.roleId, endsAt: result.endsAt });
        return respond(i, { kind: "success", title: "Halloween Event Started", description: "The event is now active and ends <t:" + Math.floor(result.endsAt.getTime() / 1000) + ":R>." });
      }
      const result = await s.halloween.stopEvent(i.guildId, i.user.id);
      await audit(s.pool, i.guildId, i.user.id, "halloween_event_stopped", null, { eventId: result.eventId });
      return respond(i, { kind: "warning", title: "Halloween Event Stopped", description: "The event has been disabled for this server." });
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
module.exports = { loadCommands };
