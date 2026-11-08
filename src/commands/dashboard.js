const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ChannelType,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags, PermissionFlagsBits
} = require("discord.js");
const settings = require("../config/settings");
const balancing = require("../config/game-balancing");
const { createEmbed } = require("../ui");
const { createArenaCard } = require("../utils/arena-card");
const { getPlayer, getLeaderboard } = require("../services/economy");
const { getUpgradeCost } = require("../services/inventory");
const { levelXpRequired, uuid, getRebirthMultiplier, getLevelEarningMultiplier } = require("../utils/core");
const { makeWorkChallenge, getWorkShiftTimeLimit } = require("../games/work-challenge");
const { audit, sendLog } = require("../utils/logging");
const { tradeCard } = require("../services/trade-interactions");
const { leaderboardPayload } = require("./leaderboard-ui");

const sessions = new Map();

function isOwner(i) {
  return Boolean((settings.ownerId && i.user.id === settings.ownerId) || i.guild?.ownerId === i.user.id);
}
function memberRoleIds(i) {
  const roles = i.member?.roles;
  return roles?.cache ? Array.from(roles.cache.keys()) : Array.isArray(roles) ? roles : [];
}
async function isAdmin(i, services) {
  // The configured Admin Role is a trusted bot-operator role, alongside the two owners.
  return services.security.hasAdminAccess(i.guild, i.user.id);
}
function btn(owner, action, label, style = ButtonStyle.Secondary, emoji, extra) {
  const b = new ButtonBuilder().setCustomId(["dash", owner, action, extra].filter(Boolean).join(":")).setLabel(label).setStyle(style);
  return b;
}
function aBtn(owner, action, label, style = ButtonStyle.Secondary, emoji, extra) {
  const b = new ButtonBuilder().setCustomId(["admin", owner, action, extra].filter(Boolean).join(":")).setLabel(label).setStyle(style);
  return b;
}
function row(...items) { return new ActionRowBuilder().addComponents(...items); }
function menu(owner, action, placeholder, options, extra) {
  return row(new StringSelectMenuBuilder().setCustomId(["dash", owner, action, extra].filter(Boolean).join(":")).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1).addOptions(options.slice(0, 25)));
}
async function safeAudit(i, services, action, targetId = null, details = {}) {
  if (await services.security.isAboveBotRole(i.guild, i.user.id)) return;
  return audit(services.pool, i.guildId, i.user.id, action, targetId, details);
}
async function safeSendLog(i, services, content) {
  if (await services.security.isAboveBotRole(i.guild, i.user.id)) return;
  return sendLog(i.client, i.guildId, content);
}

function formatMemberActivityLog(action, displayName, actorId, details = {}, kind = "success") {
  const labels = {
    crime_attempt: "CRIME OPERATION",
    work_shift_completed: "WORK SHIFT COMPLETE",
    daily_reward_claimed: "DAILY REWARD CLAIMED",
    casino_round: "CASINO ROUND",
    heist_completed: "HEIST COMPLETE",
    bank_deposit: "BANK DEPOSIT",
    bank_withdrawal: "BANK WITHDRAWAL",
    halloween_weekly_claimed: "WEEKLY EVENT CLAIMED"
  };
  const pretty = (value) => String(value).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const fields = [];
  const add = (name, value) => {
    if (value === undefined || value === null || value === "") return;
    fields.push({ name, value: String(value).slice(0, 1024), inline: true });
  };
  if (details.careerId) add("Career", pretty(details.careerId));
  if (details.crimeId) add("Operation", pretty(details.crimeId));
  if (details.game) add("Game", details.game);
  if (typeof details.succeeded === "boolean") add("Result", details.succeeded ? "SUCCESS" : "FAILED");
  if (Number.isFinite(Number(details.correct)) && details.total) add("Answers", details.correct + "/" + details.total);
  if (details.pay !== undefined) add("Pay", Number(details.pay).toLocaleString() + " FC");
  if (details.reward !== undefined) add("Reward", Number(details.reward).toLocaleString() + " FC");
  if (details.fine !== undefined && Number(details.fine) > 0) add("Fine", Number(details.fine).toLocaleString() + " FC");
  if (details.xp !== undefined) add("XP", "+" + Number(details.xp).toLocaleString());
  if (details.candy !== undefined) add("Candy", "+" + Number(details.candy));
  if (details.successChance !== undefined) add("Success chance", Number(details.successChance) + "%");
  if (details.wager !== undefined) add("Wager", Number(details.wager).toLocaleString() + " FC");
  if (details.payout !== undefined) add("Payout", Number(details.payout).toLocaleString() + " FC");
  if (details.net !== undefined) add("Net", (Number(details.net) > 0 ? "+" : "") + Number(details.net).toLocaleString() + " FC");
  if (details.amount !== undefined) add("Amount", Number(details.amount).toLocaleString() + " FC");
  if (details.messages !== undefined) add("Messages", Number(details.messages).toLocaleString());
  const colors = { success: settings.brand.success, warning: settings.brand.warning, info: settings.brand.primary };
  return createEmbed({
    title: "🎮  FUKISHOKAI  /  " + (labels[action] || pretty(action)).toUpperCase(),
    description: "<@" + actorId + "> · **" + displayName + "**",
    fields: fields.slice(0, 10),
    color: colors[kind] || colors.info,
    icon: "profile",
    footer: "ACTIVITY RECORD  •  Full details retained in audit history"
  });
}

async function recordMemberAction(i, services, action, announcement, details = {}, kind = "success", publicResultEmbed = null) {
  // Trusted owners and higher-ranked members are exempt from operational/security logs,
  // but their completed gameplay remains visible like every other member's gameplay.
  const exemptFromMonitoring = await services.security.isAboveBotRole(i.guild, i.user.id);
  const actorId = i.user.id;
  const displayName = i.member?.displayName || i.user.globalName || i.user.username;

  if (!exemptFromMonitoring) {
    try {
      await safeAudit(i, services, action, actorId, details);
    } catch (error) {
      console.warn("[activity] Could not write member audit entry:", action, error.code || error.message);
    }
    try {
      await safeSendLog(i, services, formatMemberActivityLog(action, displayName, actorId, details, kind));
    } catch (error) {
      console.warn("[activity] Could not send member activity log:", action, error.code || error.message);
    }
  }

  try {
    let channel = i.channel;
    if ((!channel || !channel.isTextBased()) && i.channelId) {
      channel = await i.client.channels.fetch(i.channelId);
    }
    if (channel && channel.isTextBased() && typeof channel.send === "function") {
      const colors = { success: settings.brand.success, warning: settings.brand.warning, info: settings.brand.primary };
      const embed = publicResultEmbed || createEmbed({
        title: "FUKISHOKAI  /  MEMBER ACTIVITY",
        description: "<@" + actorId + "> · **" + displayName + "** " + announcement,
        color: colors[kind] || colors.info,
        icon: "profile",
        footer: false
      });
      // Every public activity receipt identifies its actor, including custom game-result embeds.
      // Keep the brand author intact and use a dedicated field for consistent attribution.
      if (publicResultEmbed) {
        const alreadyHasActor = publicResultEmbed.data?.fields?.some((field) =>
          /^(member|player|performed by)$/i.test(String(field.name || "").trim())
        );
        if (!alreadyHasActor) {
          publicResultEmbed.addFields({
            name: "Player",
            value: "<@" + actorId + "> · **" + displayName + "**",
            inline: false
          });
        }
      }
      try {
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      } catch (embedError) {
        await channel.send({
          content: "FUKISHOKAI activity · <@" + actorId + "> (" + displayName + ") " + announcement,
          allowedMentions: { parse: [] }
        });
      }
    }
  } catch (error) {
    console.warn("[activity] Could not publish member action:", action, error.code || error.message);
  }
}

function panel(title, description, fields = [], components = [], kind = "info", footer = "FUKISHOKAI  •  Your interactive game centre") {
  const palette = {
    info: settings.brand.primary, success: settings.brand.success,
    warning: settings.brand.warning, error: settings.brand.danger
  };
  const embed = createEmbed({
    title, description, fields, color: palette[kind] || palette.info,
    footer, icon: "profile"
  });
  return { embeds: [embed], components };
}
function bar(value, max, width = 12) {
  const goal = Math.max(1, Number(max) || 1);
  const n = Math.max(0, Math.min(goal, Number(value) || 0));
  const fill = Math.round(n / goal * width);
  return "▰".repeat(fill) + "▱".repeat(width - fill) + "  " + Math.floor(n).toLocaleString() + "/" + goal.toLocaleString();
}
function formatItemEffects(effects = {}) {
  const lines = [];
  const percent = (value) => Math.round(Number(value || 0) * 100);
  if (effects.moneyBonus) lines.push("FC income +" + percent(effects.moneyBonus) + "%");
  if (effects.xpBonus) lines.push("XP +" + percent(effects.xpBonus) + "%");
  if (effects.workPayBonus) lines.push("Work salary +" + percent(effects.workPayBonus) + "%");
  if (effects.workXpBonus) lines.push("Work XP +" + percent(effects.workXpBonus) + "%");
  if (effects.crimeRewardBonus) lines.push("Crime rewards +" + percent(effects.crimeRewardBonus) + "%");
  if (effects.crimeChance) lines.push("Crime success +" + effects.crimeChance + " points");
  if (effects.heistChance) lines.push("Heist success +" + effects.heistChance + " points");
  if (effects.casinoChance) lines.push("Casino win chance +" + effects.casinoChance + " points");
  if (effects.slotLuck) lines.push("Slots luck +" + effects.slotLuck + " roll shift");
  if (effects.fineReduction) lines.push("Fines -" + percent(effects.fineReduction) + "%");
  if (effects.candyDropBonus) lines.push("Candy drop chance +" + percent(effects.candyDropBonus) + " points");
  for (const [key, label] of [
    ["workCooldownReduction", "Work cooldown"],
    ["crimeCooldownReduction", "Crime cooldown"],
    ["heistCooldownReduction", "Heist cooldown"],
    ["dailyCooldownReduction", "Daily cooldown"],
    ["casinoCooldownReduction", "Casino cooldown"]
  ]) if (effects[key]) lines.push(label + " -" + percent(effects[key]) + "%");
  return lines.length ? lines.join(" · ") : "No active bonuses";
}
function formatCareerEffects(effects = {}) {
  const lines = [];
  const percent = (value) => Math.round(Number(value || 0) * 100);
  if (effects.workPayBonus) lines.push("Work pay +" + percent(effects.workPayBonus) + "%");
  if (effects.workCooldownReduction) lines.push("Work cooldown -" + percent(effects.workCooldownReduction) + "%");
  if (effects.moneyBonus) lines.push("All FC income +" + percent(effects.moneyBonus) + "%");
  if (effects.crimeChance) lines.push("Crime success +" + effects.crimeChance + " points");
  if (effects.crimeRewardBonus) lines.push("Crime rewards +" + percent(effects.crimeRewardBonus) + "%");
  if (effects.fineReduction) lines.push("Fines -" + percent(effects.fineReduction) + "%");
  if (effects.heistChance) lines.push("Heist success +" + effects.heistChance + " points");
  return lines.length ? lines.join(" · ") : "No passive perk";
}
function back(owner) { return row(btn(owner, "home", "Dashboard", ButtonStyle.Secondary, "⌂")); }
function modal(customId, title, fields) {
  const m = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const f of fields) {
    const input = new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setPlaceholder(f.placeholder || "")
      .setStyle(f.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(f.required !== false).setMaxLength(f.max || 100);
    if (typeof f.value === "string" && f.value.length) input.setValue(f.value.slice(0, f.max || 100));
    m.addComponents(row(input));
  }
  return m;
}
function numberField(i, id, min, max, label) {
  const value = Number(i.fields.getTextInputValue(id));
  const hasMaximum = max !== null && max !== undefined;
  if (!Number.isSafeInteger(value) || value < min || (hasMaximum && value > max)) {
    const range = hasMaximum
      ? "from " + min.toLocaleString() + " to " + max.toLocaleString()
      : "at least " + min.toLocaleString();
    throw new Error(label + " must be a whole number " + range + ".");
  }
  return value;
}
async function renderMenu(guildId, owner, page, s) {
  const nav = back(owner);
  if (page === "home") {
    const p = await getPlayer(s.pool, guildId, owner);
    const seasonal = await s.halloween.status(guildId, owner);
    const fcParty = s.economyEvents ? await s.economyEvents.getActive(guildId) : null;
    const career = balancing.jobs.find((j) => j.id === p.job_id);
    const wealth = Number(p.wallet) + Number(p.bank);
    return panel("FUKISHOKAI  /  PLAYER HUB", "Earn FC with Daily, Work, scavenging, delivery contracts and server events. Complete weekly quests for Candy, then spend it on seasonal collectibles." + (fcParty ? "\n\n**" + fcParty.name + " is active** · Normal eligible FC rewards are multiplied by " + fcParty.multiplier + "× until <t:" + Math.floor(new Date(fcParty.ends_at).getTime() / 1000) + ":R>." : ""),
      [
        { name: "💎 Total wealth", value: wealth.toLocaleString() + " FC", inline: true },
        { name: "👛 Wallet", value: Number(p.wallet).toLocaleString() + " FC", inline: true },
        { name: "🏦 Bank", value: Number(p.bank).toLocaleString() + " FC", inline: true },
        { name: "🍬 Candy", value: Number(seasonal.wallet.candy || 0).toLocaleString(), inline: true },
        { name: "⭐ Player level", value: "Level " + p.level + "\n" + bar(p.xp, levelXpRequired(Number(p.level)), 10), inline: false },
        { name: "💼 Career", value: career ? career.name + "  ·  Job level " + p.job_level : "Not selected — open Careers to choose one.", inline: true },
        { name: "🎯 Your next step", value: career ? "Go to Earn and claim Daily or start Work. Then use Gear when you can afford an upgrade." : "1. Open Careers. 2. Choose the first job you qualify for. 3. Open Earn and start Work." }
      ],
      [
        row(btn(owner, "profile", "Profile", ButtonStyle.Primary, "👤"), btn(owner, "earn", "Earn", ButtonStyle.Success, "💰"), btn(owner, "career", "Careers", ButtonStyle.Secondary, "💼"), btn(owner, "gear", "Gear", ButtonStyle.Secondary, "🎒"), btn(owner, "games", "Games", ButtonStyle.Secondary, "🎮")),
        row(btn(owner, "heists", "Heists", ButtonStyle.Secondary, "🕵️"), btn(owner, "event", "Halloween", ButtonStyle.Secondary, "🎃"), btn(owner, "bank", "Bank", ButtonStyle.Secondary, "🏦"), btn(owner, "trade", "Trade", ButtonStyle.Secondary, "⇄"), btn(owner, "rankings", "Leaderboard", ButtonStyle.Secondary, "🏆")),
        row(btn(owner, "rebirth", "Rebirth", ButtonStyle.Primary, "♻️"), btn(owner, "achievements", "Achievements", ButtonStyle.Secondary, "🏅"), btn(owner, "weekly", "Weekly quests", ButtonStyle.Secondary, "🍬"), btn(owner, "help", "How to play", ButtonStyle.Secondary, "📖"), btn(owner, "refresh", "Refresh", ButtonStyle.Secondary, "🔄"))
      ], "info", "FUKISHOKAI  •  Private player dashboard");
  }
  if (page === "profile") {
    const p = await getPlayer(s.pool, guildId, owner);
    const career = balancing.jobs.find((j) => j.id === p.job_id);
    const booster = s.serverBoosters ? await s.serverBoosters.getStatus(guildId, owner) : null;
    return panel("PLAYER PROFILE", "Your current standing, wealth and activity across Fukishokai.", [
      { name: "⭐ Level " + p.level, value: bar(p.xp, levelXpRequired(Number(p.level))) + "\nXP to next level: " + Number(p.xp).toLocaleString() + "/" + levelXpRequired(Number(p.level)).toLocaleString() },
      { name: "💼 Career", value: career ? career.name + "  ·  Level " + p.job_level : "Unemployed", inline: true },
      { name: "💰 Wealth", value: (Number(p.wallet) + Number(p.bank)).toLocaleString() + " FC", inline: true },
      { name: "📈 Lifetime earned", value: Number(p.lifetime_earned).toLocaleString() + " FC", inline: true },
      { name: "🎭 Successful crimes", value: Number(p.crime_successes).toLocaleString(), inline: true },
      { name: "🕵️ Heists completed", value: Number(p.heists_completed).toLocaleString(), inline: true },
      { name: "⭐ Reputation", value: String(p.reputation), inline: true },
      { name: "♻️ Rebirths", value: Number(p.prestige || 0) + " · " + getRebirthMultiplier(p.prestige).toLocaleString() + "× FC / XP", inline: true },
      ...(booster ? [{
        name: "⚡ Server Booster",
        value: booster.active
          ? "Active · " + booster.serverBoostCount + " total server boosts · +15% FC, XP, Party points and event rewards"
          : "Not currently boosting · Booster-only gear already earned stays in your inventory",
        inline: false
      }] : [])
    ], [nav]);
  }
  if (page === "earn") {
    const p = await getPlayer(s.pool, guildId, owner);
    const career = balancing.jobs.find((j) => j.id === p.job_id);
    const party = s.economyEvents ? await s.economyEvents.getActive(guildId) : null;
    return panel("EARN  /  GET FC", "Choose from several repeatable ways to earn. Normal game rewards stack with level, rebirth, gear and any active server FC party." +
      (party ? "\n\n**" + party.name + " active: " + party.multiplier + "× FC**" : ""),
      [
        { name: "Daily", value: "Claim a large FC and XP reward every 18 hours. Higher levels earn more FC." },
        { name: "Work shift", value: career ? "Complete a role-based question shift for FC, XP and promotion progress as a " + career.name + "." : "Choose a career first to unlock Work shifts." },
        { name: "Scavenge", value: "Search the district every 30 minutes for a variable FC cache and some XP." },
        { name: "Delivery contract", value: "Complete a courier route every 3 hours for a larger FC payment and XP." },
        { name: "Weekly activity", value: "Chat normally to fill the weekly bar. Bot messages do not count; chat FC/XP have separate daily caps." }
      ], [
        row(btn(owner, "daily", "Claim Daily", ButtonStyle.Success), btn(owner, "work", "Work Shift", ButtonStyle.Primary)),
        row(btn(owner, "scavenge", "Scavenge", ButtonStyle.Secondary), btn(owner, "delivery", "Delivery Contract", ButtonStyle.Secondary)),
        nav
      ]);
  }
  if (page === "achievements") {
    const entries = await s.achievements.status(guildId, owner);
    const claimed = entries.filter((item) => item.claimed).length;
    const ready = entries.filter((item) => item.unlocked && !item.claimed);
    const fields = entries.map((item) => {
      const state = item.claimed ? "CLAIMED" : item.unlocked ? "READY TO CLAIM" : item.progressPercent + "%";
      const progress = bar(item.current, item.target, 9);
      return {
        name: (item.claimed ? "✅ " : item.unlocked ? "🎁 " : "▫️ ") + item.name + " · " + state,
        value: item.description + "\n" + progress + "\nReward: " + item.rewardFc.toLocaleString() + " FC · " + item.rewardXp + " XP"
      };
    });
    const controls = [];
    if (ready.length) {
      controls.push(menu(owner, "achievement-claim", "Claim an unlocked achievement", ready.map((item) => ({
        label: item.name,
        value: item.id,
        description: "+" + item.rewardFc.toLocaleString() + " FC · +" + item.rewardXp + " XP"
      }))));
    }
    controls.push(nav);
    return panel("ACHIEVEMENT BOOK", "Permanent milestones across work, careers, operations, heists, progression and Party Games. Progress never expires.\n\n**Collected:** " + claimed + "/" + entries.length + " · **Ready to claim:** " + ready.length,
      fields, controls, ready.length ? "success" : "info", "FUKISHOKAI  •  Permanent player milestones");
  }
  if (page === "career") {
    const data = await s.jobs.view(guildId, owner);
    const current = data.job ? data.job.name + " · Job level " + data.player.job_level : "Not selected";
    const currentPerk = data.job ? formatCareerEffects(balancing.careerEffects[data.job.id]) : "Choose a career to unlock its passive perk.";
    const options = data.jobs.map((j) => ({
      label: j.name, value: j.id,
      description: "Level " + j.minLevel + "+ · Wallet " + j.minWallet.toLocaleString() + " FC · " + formatCareerEffects(balancing.careerEffects[j.id]).slice(0, 45)
    }));
    const lines = data.jobs.map((j) => "**" + j.tier + ". " + j.name + "** · Level " + j.minLevel + "+\nWallet " + j.minWallet.toLocaleString() + " FC · Pay " + j.payMin.toLocaleString() + "–" + j.payMax.toLocaleString() + " FC\n**Career perk:** " + formatCareerEffects(balancing.careerEffects[j.id]) + "\n" + j.description);
    const threshold = balancing.careerProgression.baseXp + (Number(data.player.job_level) * Number(data.player.job_level) * balancing.careerProgression.xpPerLevelSquared);
    const jobProgress = data.job ? bar(data.player.job_xp, threshold, 10) : "Apply for a career to start earning job XP.";
    return panel("CAREER DESK", "Every career has a distinct passive perk. Higher tiers unlock better work pay and more advanced operations.\n\n**Current career:** " + current,
      [
        { name: "Active career perk", value: currentPerk },
        { name: "Promotion progress", value: jobProgress + (data.job ? "\n" + Number(data.player.job_xp).toLocaleString() + "/" + threshold.toLocaleString() + " job XP" : "") },
        { name: "Career paths", value: lines.join("\n\n").slice(0, 3300) }
      ],
      [menu(owner, "job-apply", "Choose a career to apply for", options), nav]);
  }
  if (page === "bank") {
    const [b, activity] = await Promise.all([
      s.economy.getBalance(guildId, owner),
      s.economy.getBankHistory(guildId, owner, 5)
    ]);
    const recent = activity.recent.map((item) => {
      const deposited = item.reason === "bank_deposit";
      const timestamp = Math.floor(new Date(item.created_at).getTime() / 1000);
      return (deposited ? "⬆️ Deposited " : "⬇️ Withdrew ") + item.amount.toLocaleString() +
        " FC · " + (Number.isFinite(timestamp) ? "<t:" + timestamp + ":R>" : "Recent");
    });
    return panel("BANK  /  FINANCES", "Move FC safely between your wallet and savings. Deposits and withdrawals are 1:1 with no transfer fee; bank movements do not count as new lifetime earnings.", [
      { name: "👛 Wallet", value: b.wallet.toLocaleString() + " FC", inline: true },
      { name: "🏦 Bank savings", value: b.bank.toLocaleString() + " FC", inline: true },
      { name: "💎 Combined wealth", value: b.total.toLocaleString() + " FC", inline: true },
      { name: "📈 Lifetime bank activity", value: "Deposited " + activity.deposited.toLocaleString() + " FC · Withdrawn " + activity.withdrawn.toLocaleString() + " FC · " + activity.transactions + " transactions" },
      { name: "🧾 Recent transactions", value: recent.length ? recent.join("\n") : "Your bank deposits and withdrawals will appear here." }
    ], [row(btn(owner, "deposit", "Deposit", ButtonStyle.Success, "⬆️"), btn(owner, "withdraw", "Withdraw", ButtonStyle.Primary, "⬇️")), nav]);
  }
  if (page === "trade") {
    const active = s.trades ? await s.trades.getActive(guildId, owner) : null;
    if (!active) {
      return panel("SECURE PLAYER TRADING", "Create a trade with another member. Both players must offer FC or items, and both must confirm the same final offer. Free gifts are blocked. Trades expire after 30 minutes.",
        [
          { name: "Trade safety", value: "FC and item ownership are checked again when both players confirm. Offers are exchanged in one database transaction." },
          { name: "Rules", value: "Each side may offer FC and up to 10 item types. Editing an offer clears both confirmations. Booster-exclusive Mythic items cannot be traded." }
        ], [row(new UserSelectMenuBuilder().setCustomId("dash:" + owner + ":trade-target").setPlaceholder("Choose a member to trade with").setMinValues(1).setMaxValues(1)), nav]);
    }
    const card = tradeCard(active, owner);
    const inv = await s.inventory.getInventory(guildId, owner);
    const offered = new Set(active.offers[active.initiator_id === owner ? "initiator" : "target"].items.map(x => x.itemId));
    const itemOptions = inv.items.filter(x => !x.item.boosterOnly && !offered.has(x.item.id)).slice(0, 25).map(x => ({
      label: x.item.name.slice(0, 100), value: x.item.id,
      description: "Owned: " + x.quantity + (x.upgradeLevel ? " · Upgrade " + x.upgradeLevel : "")
    }));
    const controls = [
      row(btn(owner, "trade-fc", "Set FC offer", ButtonStyle.Primary, null, active.id),
        btn(owner, "trade-confirm", "Confirm offer", ButtonStyle.Success, null, active.id),
        btn(owner, "trade-cancel", "Cancel trade", ButtonStyle.Danger, null, active.id))
    ];
    if (itemOptions.length) controls.push(menu(owner, "trade-item", "Add an item to your offer", itemOptions, active.id));
    controls.push(nav);
    return panel(card.title, card.description, card.fields, controls, "info");
  }
  if (page === "gear") {
    const inv = await s.inventory.getInventory(guildId, owner);
    const effects = await s.inventory.getEffects(guildId, owner);
    const booster = s.serverBoosters ? await s.serverBoosters.getStatus(guildId, owner) : null;
    const specialItems = inv.items.filter((entry) => entry.item.boosterOnly);
    const standardItems = inv.items.filter((entry) => entry.item.type === "equipment" && !entry.item.boosterOnly);
    const collectibles = inv.items.filter((entry) => entry.item.type !== "equipment");
    const specialLines = specialItems.map((entry) => {
      const current = "🌟 **MYTHIC · " + entry.item.name + "** · Personal boost #" + entry.item.boostNumber +
        " · Upgrade " + entry.upgradeLevel + "/" + balancing.itemUpgrades.maxLevel +
        (entry.equipped ? " · AUTO-EQUIPPED" : "");
      const next = entry.upgradeLevel >= balancing.itemUpgrades.maxLevel
        ? " · MAX LEVEL"
        : " · Next upgrade: " + getUpgradeCost(entry.item, entry.upgradeLevel + 1).toLocaleString() + " FC";
      return current + next + "\n" + (entry.item.rewardSummary || formatItemEffects(entry.item.effects));
    });
    const standardLines = standardItems.map((entry) => {
      const current = (entry.equipped ? "🟢 " : "▫️ ") + "**" + entry.item.name + "** · Upgrade " +
        entry.upgradeLevel + "/" + balancing.itemUpgrades.maxLevel + (entry.equipped ? " · Equipped" : "");
      const ability = entry.item.ability
        ? "\n*Ability — " + entry.item.ability + ":* " + entry.item.abilityDescription
        : "";
      const bonuses = "\n*Bonuses:* " + formatItemEffects(entry.item.effects);
      if (entry.upgradeLevel >= balancing.itemUpgrades.maxLevel) return current + " · MAX" + ability + bonuses;
      const nextLevel = entry.upgradeLevel + 1;
      const nextCost = getUpgradeCost(entry.item, nextLevel);
      const requiredLevel = entry.item.minLevel + nextLevel * balancing.itemUpgrades.levelRequirementPerUpgrade;
      return current + " · Next: " + nextCost.toLocaleString() + " FC / Lv " + requiredLevel + ability + bonuses;
    });
    const collectibleLines = collectibles.map((entry) =>
      "🎃 **" + entry.item.name + "** × " + entry.quantity + " · Candy collectible"
    );
    const equipped = inv.equipped.map((entry) => {
      const ownedItem = inv.items.find((item) => item.item.id === entry.item.id);
      return "**" + entry.item.name + ":** " + (entry.item.boosterOnly ? "🌟 MYTHIC" : entry.slot) +
        " · Upgrade " + (ownedItem?.upgradeLevel || 0) + "/" + balancing.itemUpgrades.maxLevel;
    });
    const controls = [];
    const equip = inv.items.filter((entry) =>
      entry.item.type === "equipment" && !entry.equipped
    ).map((entry) => ({
      label: (entry.item.boosterOnly ? "🌟 " : "") + entry.item.name,
      value: entry.item.id,
      description: (entry.item.boosterOnly ? "MYTHIC · " : "") + "Equip in " + entry.item.slot
    }));
    const unequip = inv.equipped.map((entry) => ({
      label: entry.slot,
      value: entry.slot,
      description: entry.item.name
    }));
    const upgrade = inv.items.filter((entry) =>
      entry.item.type === "equipment" && entry.upgradeLevel < balancing.itemUpgrades.maxLevel
    ).map((entry) => {
      const nextLevel = entry.upgradeLevel + 1;
      const cost = getUpgradeCost(entry.item, nextLevel);
      const requiredLevel = entry.item.minLevel + nextLevel * balancing.itemUpgrades.levelRequirementPerUpgrade;
      return {
        label: (entry.item.boosterOnly ? "🌟 " : "") + entry.item.name,
        value: entry.item.id,
        description: (entry.item.boosterOnly ? "MYTHIC · " : "") +
          "Upgrade " + nextLevel + "/" + balancing.itemUpgrades.maxLevel + " · " +
          cost.toLocaleString() + " FC · Player level " + requiredLevel + "+"
      };
    });
    if (equip.length) controls.push(menu(owner, "equip", "Equip an item", equip));
    if (unequip.length) controls.push(menu(owner, "unequip", "Unequip an item", unequip));
    if (upgrade.length) controls.push(menu(owner, "upgrade-item", "Upgrade an item", upgrade));
    controls.push(row(btn(owner, "shop", "Normal equipment shop", ButtonStyle.Primary, "🛒")));
    controls.push(nav);

    const allEquipment = [...standardItems, ...specialItems];
    const totalUpgradeLevels = allEquipment.reduce((sum, entry) => sum + entry.upgradeLevel, 0);
    const equippedUpgradeLevels = allEquipment.filter((entry) => entry.equipped)
      .reduce((sum, entry) => sum + entry.upgradeLevel, 0);
    const nextUpgradeCosts = allEquipment.filter((entry) => entry.upgradeLevel < balancing.itemUpgrades.maxLevel)
      .map((entry) => getUpgradeCost(entry.item, entry.upgradeLevel + 1)).sort((a, b) => a - b);
    const boosterItems = balancing.items.filter((item) => item.boosterOnly).sort((a, b) => a.boostNumber - b.boostNumber);
    const boosterProgress = booster
      ? Math.min(booster.personalBoostCount || 0, boosterItems.length) + "/" + boosterItems.length +
        " MYTHIC rewards · " + (booster.personalBoostCount || 0) + " of your boosts recorded. " +
        (booster.collectionComplete
          ? "You have completed the special collection."
          : booster.nextItem
            ? "Next boost reward: **" + booster.nextItem.name + "**. It is assigned and equipped automatically."
            : "Your next boost event will be checked automatically.")
      : "Personal boost progress appears here after your booster status is synced.";
    return panel("GEAR  /  YOUR ITEMS",
      "Two clear categories: **NORMAL** = buy with FC. **🌟 MYTHIC BOOSTER EXCLUSIVE** = special gear earned automatically from your own server boosts, never bought or claimed. MYTHIC items have stronger, unique perks. Equip gear to use its bonuses; upgrade either type with FC up to level " + balancing.itemUpgrades.maxLevel + ".",
      [
        { name: "🌟 MYTHIC · BOOSTER EXCLUSIVES", value: specialLines.length ? specialLines.join("\n\n").slice(0, 1024) : "No MYTHIC item yet. Your first personal server boost automatically gives you the Crimson Oni Katana. No claim button, no shop and no FC cost." },
        { name: "⚙️ NORMAL EQUIPMENT", value: standardLines.length ? standardLines.join("\n").slice(0, 1024) : "No normal equipment yet. Open the shop to buy gear with FC." },
        ...(collectibleLines.length ? [{ name: "🎃 CANDY COLLECTIBLES", value: collectibleLines.join("\n").slice(0, 800) }] : []),
        { name: "⚡ BOOSTER REWARD PROGRESS", value: boosterProgress },
        { name: "🌟 ALL 5 MYTHIC BOOST REWARDS", value: boosterItems.map((item) => "**#" + item.boostNumber + " " + item.name + "** — " + (item.rewardSummary || formatItemEffects(item.effects))).join("\n").slice(0, 1024) },
        { name: "🧩 EQUIPPED LOADOUT", value: equipped.length ? equipped.join("\n").slice(0, 900) : "Nothing equipped yet. Choose an item above to equip it." },
        { name: "⚙️ ACTIVE BONUSES", value: formatItemEffects(effects).slice(0, 1000) },
        { name: "📊 COLLECTION", value: standardItems.length + "/" + balancing.items.filter((item) => item.type === "equipment" && !item.boosterOnly).length +
          " normal items · " + specialItems.length + "/" + boosterItems.length + " MYTHIC items · " +
          totalUpgradeLevels + " total upgrade levels · " + equippedUpgradeLevels + " equipped upgrade levels" +
          (nextUpgradeCosts.length ? "\nCheapest next upgrade: " + nextUpgradeCosts[0].toLocaleString() + " FC" : "") }
      ], controls);
  }
  if (page === "shop") {
    const shopItems = balancing.items.filter((item) => !item.boosterOnly);
    const options = shopItems.map((x) => ({ label: x.name, value: x.id, description: x.cost.toLocaleString() + " FC · Level " + x.minLevel + "+ · " + x.slot }));
    const list = shopItems.map((x) => "**" + x.name + "** · " + x.cost.toLocaleString() + " FC\n" + (x.rarity ? "**" + x.rarity + "** · " : "") + "Level " + x.minLevel + "+ · " + x.slot + "\n" + x.description + (x.ability ? "\n*Ability — " + x.ability + ":* " + x.abilityDescription : "") + "\n*Bonuses:* " + formatItemEffects(x.effects));
    return panel("NORMAL EQUIPMENT SHOP", "These are regular items bought with FC. 🌟 MYTHIC booster items are separate: your personal boosts award them automatically, and you can upgrade them from Gear.",
      [{ name: "Available equipment", value: list.join("\n\n").slice(0, 3900) }],
      [menu(owner, "shop-buy", "Select equipment to purchase", options), nav]);
  }
  if (page === "rebirth" || page === "rebirth-confirm") {
    const [status, history] = await Promise.all([
      s.economy.getRebirthStatus(guildId, owner),
      s.economy.getRebirthHistory(guildId, owner, 5)
    ]);
    const mark = (passed) => passed ? "✅" : "▫️";
    const lines = [
      mark(status.checks.wealth) + " **FC:** " + status.wealth.toLocaleString() + "/" + status.walletRequired.toLocaleString(),
      mark(status.checks.level) + " **Level:** " + status.level + "/" + status.levelRequired +
        " · **Job:** " + (status.currentJob ? status.currentJob.name : "None") + " (" + status.currentJobLevel + "/" + status.jobLevelRequired + ")",
      mark(status.checks.quests) + " **Quests:** " + status.questClaimsCount + "/" + status.questClaimsRequired +
        " · " + mark(status.checks.workShifts) + " **Shifts:** " + status.workShiftsCompleted + "/" + status.workShiftsRequired
    ];
    if (status.gearItemsRequired > 0) {
      lines.push(
        mark(status.checks.gearItems) + " **Gear:** " + status.gearItemsCount + "/" + status.gearItemsRequired +
        " · " + mark(status.checks.candyItems) + " **Candy items:** " + status.candyItemsCount + "/" + status.candyItemsRequired +
        " · " + mark(status.checks.candyBalance) + " **Candy:** " + status.candyBalance + "/" + status.candyBalanceRequired
      );
    }
    if (status.gearUpgradeLevelsRequired > 0) {
      lines.push(mark(status.checks.gearUpgrades) + " **Upgrades:** " + status.gearUpgradeLevels + "/" + status.gearUpgradeLevelsRequired);
    }

    if (page === "rebirth-confirm") {
      return panel("CONFIRM REBIRTH", "Your next multiplier will be **" + status.nextMultiplier.toLocaleString() + "× FC/XP**. This reset cannot be undone.",
        [
          { name: "Reset", value: "2,500 FC · Bank 0 · Level 1 · Career" },
          { name: "Keep", value: "Gear · Upgrades · Candy · Collectibles · Event claims · Lifetime stats" }
        ],
        [row(btn(owner, "rebirth-confirm", "Confirm", ButtonStyle.Danger).setDisabled(!status.eligible), btn(owner, "rebirth", "Cancel", ButtonStyle.Secondary)), nav],
        "warning");
    }

    const historyLines = history.map((item) => {
      const meta = item.metadata || {};
      const wealth = Number(meta.previousWallet || 0) + Number(meta.previousBank || 0);
      const timestamp = Math.floor(new Date(item.created_at).getTime() / 1000);
      return "**Rebirth " + (meta.rebirths || "?") + "** · " + wealth.toLocaleString() + " FC · Level " +
        (meta.previousLevel || "?") + " · " + (Number.isFinite(timestamp) ? "<t:" + timestamp + ":R>" : "Recorded");
    });
    return panel("REBIRTH  /  " + status.multiplier.toLocaleString() + "×" + (status.checks.maxRebirth ? " · MAX" : " → " + status.nextMultiplier.toLocaleString() + "×"),
      status.checks.maxRebirth ? "You have reached the maximum of " + balancing.progression.maxRebirths + " rebirths and your final 101× multiplier." : "Each rebirth adds +1× to your permanent FC and XP duplication.",
      [
        { name: "Requirements", value: lines.join("\n") },
        { name: "Next-run preview", value: status.checks.maxRebirth ? "Maximum progression reached. No further rebirth is available." : "After this rebirth: " + status.nextWalletRequired.toLocaleString() + " FC · Level " + status.nextLevelRequired + " · " + status.nextQuestClaimsRequired + " quest claims · " + status.nextWorkShiftsRequired + " work shifts" },
        { name: "On rebirth", value: "Reset: 2,500 FC · Bank 0 · Level 1 · No career. Keep: gear, upgrades, Candy, collectibles, event claims and lifetime records." },
        { name: "Rebirth history", value: historyLines.length ? historyLines.join("\n") : "Your completed rebirths will be recorded here." }
      ],
      [row(btn(owner, "rebirth-review", "Rebirth", ButtonStyle.Danger).setDisabled(!status.eligible), btn(owner, "event-shop", "Candy shop", ButtonStyle.Secondary)), nav]);
  }
  if (page === "arena") {
    const status = await s.arena.getStatus(guildId, owner);
    const activeBattle = status.battle;
    const targetBoss = activeBattle
      ? status.boss
      : status.unlockedBosses[status.unlockedBosses.length - 1];
    const payload = activeBattle
      ? panel("RIFT ARENA  /  " + status.boss.name.toUpperCase(),
        status.boss.title + "\n\n" + status.boss.description,
        [
          { name: "🩸 Boss integrity", value: bar(activeBattle.bossHp, activeBattle.bossMaxHp, 18) },
          { name: "💠 Your vitality", value: bar(activeBattle.playerHp, activeBattle.playerMaxHp, 18) },
          { name: "Combat effects", value: [
            activeBattle.shield ? "AEGIS shield " + activeBattle.shield : "",
            activeBattle.weakenedTurns ? "DREAD " + activeBattle.weakenedTurns + " turns" : "",
            activeBattle.hexTurns ? "HEX " + activeBattle.hexTurns + " ticks" : ""
          ].filter(Boolean).join(" · ") || "No effects active" },
          { name: "Last action", value: activeBattle.lastEvent },
          { name: "Turn", value: String(activeBattle.turn + 1), inline: true },
          { name: "Powers spent", value: activeBattle.usedAbilities.length + "/" + status.equippedAbilities.length, inline: true }
        ],
        [
          row(btn(owner, "arena-attack", "Strike", ButtonStyle.Primary, null, String(activeBattle.turn)), btn(owner, "arena-escape", "Retreat", ButtonStyle.Danger)),
          ...(status.availableAbilities.length ? [menu(owner, "arena-ability", "Use an equipped special power", status.availableAbilities.map((item) => ({
            label: item.ability + " · " + item.name,
            value: item.id,
            description: item.description.slice(0, 95)
          })), String(activeBattle.turn))] : []),
          nav
        ], "warning", "FUKISHOKAI  •  Rift Arena / Turn-based encounter")
      : panel("RIFT ARENA  /  BOSS HUNT",
        "Enter the Rift and challenge a boss matched to your level. Battles are saved, turns are server-validated, and equipped endgame powers can each be used once per encounter.",
        [
          { name: "Unlocked bosses", value: status.unlockedBosses.map((boss) =>
            "**" + boss.name + "** · Level " + boss.minLevel + "+ · " + boss.maxHp.toLocaleString() + " HP · Reward " + boss.rewardFc.toLocaleString() + " FC"
          ).join("\n").slice(0, 1000) },
          { name: "Next gate", value: status.nextBoss
            ? status.nextBoss.name + " unlocks at level " + status.nextBoss.minLevel + "."
            : "All six bosses are unlocked. The Dragon Sovereign is the final trial." },
          { name: "Equipped powers", value: status.equippedAbilities.length
            ? status.equippedAbilities.map((item) => "**" + item.ability + "** · " + item.name).join("\n").slice(0, 900)
            : "Equip endgame gear with PHASE, DREAD, AEGIS, REBIRTH, EXECUTE, HASTE, HEX or ASCEND to unlock active powers." }
        ],
        [
          menu(owner, "arena-start", "Choose a boss to challenge", status.unlockedBosses.map((boss) => ({
            label: boss.name,
            value: boss.id,
            description: "Level " + boss.minLevel + "+ · " + boss.maxHp.toLocaleString() + " HP · +" + boss.rewardFc.toLocaleString() + " FC base"
          }))),
          row(btn(owner, "gear", "Manage gear", ButtonStyle.Secondary), btn(owner, "games", "Game room", ButtonStyle.Secondary)),
          nav
        ], "info", "FUKISHOKAI  •  Rift Arena / Boss selection");
    const imageBoss = targetBoss || { name: "The Rift", title: "Choose a challenger", minLevel: 1 };
    const image = await createArenaCard({
      boss: imageBoss,
      battle: activeBattle,
      playerLevel: status.playerLevel
    });
    payload.files = [new AttachmentBuilder(image, { name: "fukishokai-rift-arena.png" })];
    payload.embeds[0].setImage("attachment://fukishokai-rift-arena.png");
    return payload;
  }
  if (page === "games") {
    return panel("OPERATIONS  /  GAME ROOM", "These activities involve risk. Read the possible costs and requirements before starting.",
      [
        { name: "🎭 Crime", value: "Attempt an operation for a possible reward. If caught, you pay a fine." },
        { name: "🎰 Casino", value: "Play Coin Flip, High Dice or Slots. You can lose the full wager." },
        { name: "🕵️ Heists", value: "Build a crew, pick roles and attempt a team mission." }
      ], [row(btn(owner, "crime", "Crime", ButtonStyle.Secondary, "🎭"), btn(owner, "casino", "Casino", ButtonStyle.Secondary, "🎰"), btn(owner, "heists", "Heists", ButtonStyle.Primary, "🕵️"), btn(owner, "arena", "Rift Arena", ButtonStyle.Success, "⚔️")), nav]);
  }
  if (page === "crime") {
    const p = await getPlayer(s.pool, guildId, owner);
    const options = balancing.crimes.map((x) => ({ label: x.name, value: x.id, description: "Level " + x.minLevel + "+ · Base " + x.baseChance + "% · Reward " + x.rewardMin + "–" + x.rewardMax + " FC" }));
    const lines = balancing.crimes.map((x) => "**" + x.name + "** · Level " + x.minLevel + "+\nBase chance " + x.baseChance + "% · Reward " + x.rewardMin + "–" + x.rewardMax + " FC · Fine " + x.fineMin + "–" + x.fineMax + " FC");
    return panel("CRIME  /  RISK CHECK", "Select an operation. Your actual odds are affected by your level, gear, career and reputation. Failure can cost FC.\n\n**Your level:** " + p.level + " · **Wallet:** " + Number(p.wallet).toLocaleString() + " FC",
      [{ name: "Available operations", value: lines.join("\n\n") }],
      [menu(owner, "crime-run", "Choose an operation", options), nav], "warning");
  }
  if (page === "casino") {
    const games = Object.entries(balancing.casino.games);
    const [stats, history] = await Promise.all([
      s.casino.stats(guildId, owner),
      s.casino.history(guildId, owner, 5)
    ]);
    const rows = games.map(([id, g]) => row(btn(owner, "casino-" + id, g.name, ButtonStyle.Secondary)));
    rows.push(nav);
    const winRate = stats.rounds ? Math.round(stats.wins / stats.rounds * 100) : 0;
    const recent = history.map((item) => {
      const game = balancing.casino.games[item.game_id];
      const label = game ? game.name : "Casino";
      const net = item.net > 0 ? "+" + item.net.toLocaleString() : item.net.toLocaleString();
      return (item.net > 0 ? "🟢 " : item.net < 0 ? "🟠 " : "⚪ ") + "**" + label + "** · Bet " +
        item.wager.toLocaleString() + " · Payout " + item.payout.toLocaleString() + " · Net " + net + " FC";
    });
    return panel("CASINO  /  GAME TABLE",
      "Choose a game. Every player has the same published odds. Minimum bet: " +
      balancing.casino.minBet.toLocaleString() +
      " FC · No maximum · " + balancing.casino.cooldownMs / 1000 + "-second cooldown · No daily wager cap.",
      [
        ...games.map(([, g]) => ({
          name: g.name + " · Level " + g.minLevel + "+",
          value: g.description + "\nTheoretical long-run return: " + Math.round(g.theoreticalReturnRate * 100) + "%"
        })),
        { name: "📊 Your casino record", value: stats.rounds.toLocaleString() + " rounds · " + stats.wins.toLocaleString() + " wins · " + winRate + "% win rate" },
        { name: "FC performance", value: "Wagered " + stats.wagered.toLocaleString() + " FC · Paid " + stats.payout.toLocaleString() + " FC · Net " + (stats.net > 0 ? "+" : "") + stats.net.toLocaleString() + " FC" },
        { name: "Recent rounds", value: recent.length ? recent.join("\n").slice(0, 1000) : "Your completed casino rounds will appear here." }
      ],
      rows, "warning");
  }
  if (page === "heists") {
    const options = balancing.heists.map((x) => ({ label: x.name, value: x.id, description: "Level " + x.minLevel + "+ · Crew " + x.minParticipants + "–" + x.maxParticipants + " · " + x.payoutMin.toLocaleString() + "–" + x.payoutMax.toLocaleString() + " FC" }));
    const lines = balancing.heists.map((x) => "**" + x.name + "** · Level " + x.minLevel + "+\nCrew " + x.minParticipants + "–" + x.maxParticipants + " · Payout " + x.payoutMin.toLocaleString() + "–" + x.payoutMax.toLocaleString() + " FC\n" + x.description);
    return panel("HEIST COMMAND", "Create a crew and share its ID, or join an existing crew using the ID from its leader. The leader starts it when the minimum crew size is reached.",
      [{ name: "Available missions", value: lines.join("\n\n").slice(0, 3400) }],
      [menu(owner, "heist-create", "Choose a mission and create a crew", options), row(btn(owner, "heist-join", "Join a crew", ButtonStyle.Primary), btn(owner, "heist-start", "Start my crew", ButtonStyle.Success), btn(owner, "heist-status", "Check a crew")), nav]);
  }
  if (page === "event") {
    const r = await s.halloween.status(guildId, owner);
    const weekly = await s.activity.getWeekly(guildId, owner);
    if (!r.event) return panel("HALLOWEEN  /  CANDY COLLECTION", "The event schedule has ended or is not configured, but your Candy balance and collectible shop remain available for long-term rebirth progress. Candy can still drop from eligible earning actions.",
      [
        { name: "🍬 Candy balance", value: Number(r.wallet.candy || 0).toLocaleString() + " Candy", inline: true },
        { name: "Weekly activity", value: bar(weekly.messages, weekly.goal) + "\nAll human-member messages count toward your weekly total, without a counting cooldown." },
        { name: "Candy drops", value: "Daily, Work, successful Crimes, Heists, Casino rounds, Chat earnings and Achievements. Equipped gear and rebirths improve the chance." }
      ], [row(btn(owner, "event-shop", "Candy shop", ButtonStyle.Primary), btn(owner, "weekly", "Weekly quests", ButtonStyle.Secondary)), nav]);
    const progress = new Map(r.progress.map((x) => [x.quest_id, Number(x.progress)]));
    const claims = new Set(r.claims);
    const lines = r.quests.map((q) => {
      const current = Math.min(q.goal, progress.get(q.id) || 0);
      return (claims.has(q.id) ? "✅ " : current >= q.goal ? "🟡 " : "▫️ ") + "**" + q.name + "** · " + current + "/" + q.goal + (claims.has(q.id) ? " · CLAIMED" : current >= q.goal ? " · READY" : "") + "\n" + q.description + " · " + q.candy + " Candy";
    });
    const ready = r.quests.filter((q) => !claims.has(q.id) && (progress.get(q.id) || 0) >= q.goal);
    const controls = [];
    if (ready.length) controls.push(menu(owner, "event-claim", "Choose a completed quest to claim", ready.map((q) => ({ label: q.name, value: q.id, description: q.candy + " Candy · " + q.points + " points" }))));
    controls.push(row(btn(owner, "weekly", "Weekly mission"), btn(owner, "event-shop", "Seasonal shop"), btn(owner, "event-refresh", "Refresh", ButtonStyle.Primary)));
    controls.push(nav);
    return panel("HALLOWEEN  /  SEASONAL EVENT", (r.active ? "🟢 Event active" : "⚪ Event inactive") + " · Ends <t:" + Math.floor(new Date(r.event.ends_at).getTime() / 1000) + ":R>\n\n**Candy:** " + Number(r.wallet.candy || 0).toLocaleString() + " · **Event points:** " + Number(r.wallet.points || 0).toLocaleString() + "\n**Final reward:** " + r.claims.length + "/" + balancing.halloween.finalRoleQuestCount + " quests claimed.",
      [
        ...r.quests.map((q) => { const current = Math.min(q.goal, progress.get(q.id) || 0); const status = claims.has(q.id) ? " · CLAIMED" : current >= q.goal ? " · READY TO CLAIM" : ""; return { name: q.name + " · " + current + "/" + q.goal + status, value: q.description + " · Reward: " + q.candy + " Candy / " + q.points + " points" }; }),
        { name: "Candy drop chances", value: "Daily, Work, successful Crimes, Heists, Casino rounds, Chat earnings and Achievements. Gear and rebirths improve the chance (60% maximum)." }
      ], controls);
  }
  if (page === "weekly") {
    const [w, q] = await Promise.all([
      s.activity.getWeekly(guildId, owner),
      s.weeklyQuests.status(guildId, owner)
    ]);
    const ev = await s.halloween.getEvent(guildId);
    const eventActive = Boolean(ev && ev.enabled && new Date(ev.starts_at).getTime() <= Date.now() && new Date(ev.ends_at).getTime() > Date.now());
    const chatReady = w.messages >= w.goal && eventActive;
    const questFields = q.quests.map((quest) => ({
      name: (quest.claimed ? "✅ " : quest.ready ? "🎁 " : "▫️ ") + quest.name + " · " + quest.progress + "/" + quest.goal,
      value: bar(quest.progress, quest.goal, 9) + " · " + quest.candy + " Candy" +
        (quest.claimed ? " · Claimed" : quest.ready ? " · Ready to claim" : "")
    }));
    const ready = q.quests.filter((quest) => quest.ready);
    const controls = [];
    if (ready.length) controls.push(menu(owner, "weekly-quest-claim", "Claim completed weekly quest", ready.map((quest) => ({
      label: quest.name, value: quest.id, description: "+" + quest.candy + " Candy"
    }))));
    if (chatReady) controls.push(row(btn(owner, "weekly-claim", "Claim chat reward", ButtonStyle.Success, "🎁")));
    controls.push(row(btn(owner, "event-shop", "Candy shop", ButtonStyle.Secondary), btn(owner, "event", "Halloween event", ButtonStyle.Secondary), btn(owner, "weekly", "Refresh", ButtonStyle.Primary)));
    controls.push(nav);
    return panel("WEEKLY QUESTS", "Resets every Monday. Finish these tasks to earn up to **" + q.totalWeeklyCandy + " Candy each week**. Candy also drops from gameplay.",
      [
        { name: "🍬 Candy balance", value: q.candyBalance.toLocaleString() + " Candy", inline: true },
        { name: "Week starting", value: q.weekStart, inline: true },
        ...questFields,
        { name: "💬 Weekly chat mission", value: bar(w.messages, w.goal, 9) + " · " + w.messages.toLocaleString() + "/" + w.goal.toLocaleString() + " messages" +
          (chatReady ? " · Ready to claim" : !eventActive ? " · Halloween event inactive" : "") +
          (eventActive ? "\nReward: " + balancing.halloween.weeklyMessageCandyReward + " Candy + " + balancing.halloween.weeklyMessagePointsReward + " points" : "") }
      ], controls);
  }
  if (page === "event-shop") {
    const status = await s.halloween.status(guildId, owner);
    const owned = await s.inventory.getInventory(guildId, owner);
    const ownedIds = new Set(owned.items.map((x) => x.item.id));
    const options = balancing.halloween.shop
      .filter((x) => !x.unique || !ownedIds.has(x.id))
      .map((x) => ({ label: x.name, value: x.id, description: x.cost + " Candy · " + x.description.slice(0, 65) }));
    return panel("HALLOWEEN  /  CANDY COLLECTIBLES",
      "Balance: **" + Number(status.wallet.candy || 0).toLocaleString() + " Candy**. Collectibles are unique and permanent.",
      [
        ...balancing.halloween.shop.map((x) => ({
          name: x.name + " · " + x.cost + " Candy" + (ownedIds.has(x.id) ? " · OWNED" : ""),
          value: x.description
        })),
        { name: "How to earn Candy", value: "Complete all 5 weekly quests for up to **85 Candy/week**. The Crimson Relic costs **100 Candy**. You can also get random drops from Daily (16%), Work (24%), successful Crimes (18%), Heists (30%), Casino rounds (10%), chat earnings (3%) and Achievements (15%). Gear adds up to 20 percentage points; each rebirth adds 2 points, capped at 20. Total drop chance is capped at 60%." },
        { name: "Extra weekly reward", value: "While the Halloween event is active, 250 weekly messages can earn another 45 Candy." }
      ],
      [...(options.length ? [menu(owner, "event-buy", "Choose a collectible", options)] : []), nav]);
  }
  if (page === "rankings") {
    return panel("SERVER LEADERBOARDS", "Every human member is listed, including people who have never used the bot. Members with no game profile start at zero. Use the page controls to browse or search by username, display name or Discord ID.",
      [
        { name: "Total wealth", value: "Wallet plus bank balance." },
        { name: "Player level", value: "Highest level, with XP as a tie-breaker." },
        { name: "Lifetime earned", value: "All eligible game FC earnings." },
        { name: "Party Points", value: "Points earned from Party Games." },
        { name: "Weekly messages", value: "Human-member messages in the current week." }
      ], [menu(owner, "ranking-type", "Choose a ranking", [
        { label: "Total wealth", value: "wealth" }, { label: "Player level", value: "level" },
        { label: "Lifetime earned", value: "earned" }, { label: "Party Points", value: "party" },
        { label: "Weekly messages", value: "activity" }
      ]), nav], "info");
  }
  if (page === "help") {
    return panel("HOW TO PLAY  /  QUICK GUIDE", "Ignore the advanced features until you are comfortable. These are the only steps you need to get started.",
      [
        { name: "1 · Pick a career", value: "Open Careers and choose the first job you qualify for. You need a career to Work." },
        { name: "2 · Earn FC", value: "Open Earn. Claim Daily when ready or press Start Work and answer 3 simple questions." },
        { name: "3 · Build your gear", value: "Open Gear. Buy NORMAL gear in the shop with FC, equip it, and upgrade it for stronger bonuses." },
        { name: "4 · Server Booster rewards", value: "Boost this server and your personal boost #1–#5 automatically awards a different 🌟 MYTHIC item. It appears in Gear and equips itself. No claiming or FC purchase. See all 5 rewards and perks in Gear." },
        { name: "5 · Play when you want", value: "Crime and Casino are optional and risky. Heists are team missions. Read the reward and possible loss before confirming." },
        { name: "6 · Halloween", value: "Complete the listed quests to earn Candy and event points. Candy is separate from FC." },
        { name: "7 · Rebirth (advanced)", value: "Rebirth is optional. It resets wallet, bank, level and career but keeps your gear. The Rebirth page shows every requirement before you confirm." },
        { name: "What do the words mean?", value: "**FC** = game coins · **XP** = experience for levels · **Candy** = event currency · **Gear** = items that give bonuses · **MYTHIC** = rare boost-only gear." }
      ], [nav]);
  }
  return renderMenu(guildId, owner, "home", s);
}

async function renderAdmin(guildId, owner, page, s, targetId) {
  if (page === "home") {
    const cfg = await s.guildSettings.getAll(guildId);
    const ev = await s.halloween.getEvent(guildId);
    const overview = await s.pool.query(
      "SELECT " +
      "(SELECT COUNT(*) FROM players WHERE guild_id = $1)::int AS players, " +
      "(SELECT COUNT(*) FROM custom_commands WHERE guild_id = $1 AND deleted_at IS NULL)::int AS custom_commands, " +
      "(SELECT COUNT(*) FROM security_incidents WHERE guild_id = $1 AND status = 'open')::int AS open_incidents",
      [guildId]
    );
    const totals = overview.rows[0] || { players: 0, custom_commands: 0, open_incidents: 0 };
    return panel("FUKISHOKAI  /  ADMIN CONSOLE", "One private control centre for the server. The server owner, bot owner and configured Admin Role can manage every control here.",
      [
        { name: "🔐 Bot access", value: "Server owner + OWNER_ID + the configured Admin Role. Discord Administrator alone does not grant bot control." },
        { name: "⚙️ Server setup", value: "Admin role: " + (cfg.adminRoleId ? "<@&" + cfg.adminRoleId + ">" : "Not configured") + "\nLog channel: " + (cfg.logChannelId ? "<#" + cfg.logChannelId + ">" : "Not set") + "\nCommands + Candy drops: " + (cfg.memberCommandsChannelId ? "<#" + cfg.memberCommandsChannelId + ">" : "Not set") + "\nHalloween reward role: " + (cfg.halloweenRoleId ? "<@&" + cfg.halloweenRoleId + ">" : "Not set") },
        { name: "🎃 Halloween", value: ev ? (ev.enabled ? "Enabled" : "Disabled") + " · Ends <t:" + Math.floor(new Date(ev.ends_at).getTime() / 1000) + ":R>" : "Not configured" },
        { name: "📊 Operations overview", value: Number(totals.players).toLocaleString() + " player profiles · " + Number(totals.custom_commands).toLocaleString() + " saved custom commands · " + Number(totals.open_incidents).toLocaleString() + " open security incidents" }
      ], [
        row(aBtn(owner, "settings", "Server settings", ButtonStyle.Primary, "⚙️"), aBtn(owner, "event", "Event controls", ButtonStyle.Secondary, "🎃")),
        row(aBtn(owner, "player", "Player management", ButtonStyle.Secondary, "👤"), aBtn(owner, "fairness", "Leaderboard fairness", ButtonStyle.Secondary, "🏆")),
        row(aBtn(owner, "custom-commands", "Custom commands", ButtonStyle.Primary, "🧩"), aBtn(owner, "logs", "Audit history", ButtonStyle.Secondary, "📋"), aBtn(owner, "refresh", "Refresh", ButtonStyle.Secondary, "🔄")),
        row(aBtn(owner, "special-items", "Grant Mythic items", ButtonStyle.Primary, "🌟"))
      ], "info", "FUKISHOKAI  •  Private administrator console");
  }
  if (page === "special-items") {
    const specialItems = balancing.items
      .filter((item) => item.boosterOnly)
      .sort((a, b) => Number(a.boostNumber) - Number(b.boostNumber));

    if (!targetId) {
      return panel("MYTHIC ITEM GRANTS", "Choose any server member — including yourself — then select one of the five exclusive Mythic booster items. The item is granted for free and equipped automatically. This does not alter their personal boost count.",
        [
          { name: "Available items", value: specialItems.map((item) => "**#" + item.boostNumber + " · " + item.name + "**").join("\n") },
          { name: "Grant rules", value: "Items are unique. Re-granting an item will not create duplicates or erase its upgrades. Every grant is recorded in the audit history." }
        ],
        [
          row(new UserSelectMenuBuilder().setCustomId("admin:" + owner + ":special-item-target").setPlaceholder("Choose who receives the item").setMinValues(1).setMaxValues(1)),
          row(aBtn(owner, "home", "Admin console"))
        ]);
    }

    const inventory = await s.inventory.getInventory(guildId, targetId);
    const ownedById = new Map(inventory.items.map((entry) => [entry.item.id, entry]));
    const fields = specialItems.map((item) => {
      const owned = ownedById.get(item.id);
      const status = owned
        ? "Owned · Upgrade " + owned.upgradeLevel + "/" + balancing.itemUpgrades.maxLevel + (owned.equipped ? " · Equipped" : " · Not equipped")
        : "Not owned";
      return {
        name: "MYTHIC #" + item.boostNumber + " · " + item.name,
        value: "**" + status + "**\n" + (item.rewardSummary || item.description)
      };
    });
    const itemMenu = new StringSelectMenuBuilder()
      .setCustomId("admin:" + owner + ":special-item-grant:" + targetId)
      .setPlaceholder("Choose a Mythic item to grant and equip")
      .setMinValues(1).setMaxValues(1)
      .addOptions(specialItems.map((item) => ({
        label: item.name,
        value: item.id,
        description: "Personal boost reward #" + item.boostNumber + " · Grant free and auto-equip"
      })));
    return panel("GRANT MYTHIC ITEM", "Recipient: <@" + targetId + ">\nChoose any item below. The grant is free, unique and automatically equipped in its slot.",
      fields,
      [
        row(itemMenu),
        row(new UserSelectMenuBuilder().setCustomId("admin:" + owner + ":special-item-target").setPlaceholder("Choose a different member").setMinValues(1).setMaxValues(1)),
        row(aBtn(owner, "player", "Player tools", ButtonStyle.Secondary, null, targetId), aBtn(owner, "home", "Admin console"))
      ]);
  }
  if (page === "custom-commands") {
    const commands = await s.customCommands.list(guildId);
    const lines = commands.length
      ? commands.slice(0, 15).map((item) => "**/" + item.name + "** · " + (item.is_active ? "🟢 Active" : "⚪ Inactive") +
        " · " + (item.deployed_at ? "Deployed" : "Needs deployment") + "\n" + item.description).join("\n\n")
      : "No custom commands yet. Create one using the button below.";
    const components = [];
    if (commands.length) {
      components.push(row(new StringSelectMenuBuilder()
        .setCustomId("admin:" + owner + ":custom-command-select")
        .setPlaceholder("Select a custom command")
        .setMinValues(1).setMaxValues(1)
        .addOptions(commands.slice(0, 25).map((item) => ({
          label: "/" + item.name,
          value: item.id,
          description: (item.is_active ? "Active · " : item.deployed_at ? "Inactive · " : "Draft · ") + item.description.slice(0, 70)
        })))));
    }
    components.push(row(
      settings.idePublicUrl
        ? new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open Code Studio").setURL(settings.idePublicUrl.replace(/\/+$/, "") + "/ide?new=1&guildId=" + encodeURIComponent(guildId))
        : aBtn(owner, "custom-command-create", "Code Studio URL needed", ButtonStyle.Secondary).setDisabled(true),
      aBtn(owner, "custom-command-deploy", "Sync slash commands", ButtonStyle.Primary, "🚀")
    ));
    components.push(row(aBtn(owner, "home", "Admin console")));
    return panel("CUSTOM SLASH COMMANDS", "Open Code Studio to create and edit JavaScript files saved under admin-workspace/<server-id>/. Save, test, sync slash commands and activate the command here. New commands become available without restarting the bot. The browser editor includes syntax highlighting, autocomplete, formatting and preview.",
      [{ name: "Saved commands", value: lines.slice(0, 1000) },
       { name: "Workflow", value: "1. Create or edit code\n2. Sync slash commands\n3. Select the command and press Activate" },
       { name: "Placeholders", value: "{user} · {username} · {server} · {channel} · {option.name} · {option.name.username} · {option.name.mention}" }],
      components);
  }
  if (page === "custom-command") {
    const command = await s.customCommands.get(guildId, targetId);
    if (!command) return renderAdmin(guildId, owner, "custom-commands", s);
    const editButton = settings.idePublicUrl
      ? new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open in Code Studio")
        .setURL(settings.idePublicUrl.replace(/\/+$/, "") + "/ide?commandId=" + encodeURIComponent(command.id) + "&guildId=" + encodeURIComponent(guildId))
      : aBtn(owner, "custom-command-edit", "Code Studio URL needed", ButtonStyle.Secondary, null, command.id).setDisabled(true);
    const status = command.is_active ? "🟢 Active" : command.deployed_at ? "🟡 Deployed · Not active" : "⚪ Draft · Needs deployment";
    const activateButton = aBtn(owner, command.is_active ? "custom-command-deactivate" : "custom-command-activate",
      command.is_active ? "Deactivate" : "Activate",
      command.is_active ? ButtonStyle.Danger : ButtonStyle.Success, null, command.id);
    if (!command.is_active && !command.deployed_at) activateButton.setDisabled(true);
    return panel("CUSTOM COMMAND  /  " + command.name,
      "**/" + command.name + "** · " + status + "\n" + command.description,
      [
        { name: "JavaScript file", value: command.source_code ? "admin-workspace/" + guildId + "/" + command.name + ".js · " + command.source_code.length.toLocaleString() + " characters." : "Legacy command. Open Code Studio to replace it with a JavaScript file." },
        { name: "Activation", value: command.is_active ? "This command is available to members." : command.deployed_at ? "Deployed. Activate it to let members use it." : "Save changes, deploy slash commands, then activate it." }
      ],
      [
        row(activateButton, editButton),
        row(aBtn(owner, "custom-command-deploy", "Sync slash commands", ButtonStyle.Primary, "🚀"), aBtn(owner, "custom-command-delete", "Delete", ButtonStyle.Danger, "🗑️", command.id), aBtn(owner, "custom-commands", "Back"))
      ]);
  }
  if (page === "settings") {
    const cfg = await s.guildSettings.getAll(guildId);
    return panel("SERVER SETTINGS", "Choose a role or open Channel settings. Changes save immediately and are logged.", [
      { name: "Halloween reward role", value: cfg.halloweenRoleId ? "<@&" + cfg.halloweenRoleId + ">" : "Not set" },
      { name: "2× XP role", value: cfg.xpBoosterRoleId ? "<@&" + cfg.xpBoosterRoleId + ">" : "Not set" },
      { name: "Admin role", value: cfg.adminRoleId ? "<@&" + cfg.adminRoleId + ">" : "Not configured" },
      { name: "Admin log channel", value: cfg.logChannelId ? "<#" + cfg.logChannelId + ">" : "Not set" },
      { name: "Member commands + Candy-drop announcements", value: cfg.memberCommandsChannelId ? "<#" + cfg.memberCommandsChannelId + ">" : "Not set" }
    ], [
      row(new RoleSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-admin").setPlaceholder("Set trusted Admin Role").setMinValues(1).setMaxValues(1).setDefaultRoles(cfg.adminRoleId ? [cfg.adminRoleId] : [])),
      row(new RoleSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-reward").setPlaceholder("Set Halloween reward role").setMinValues(1).setMaxValues(1).setDefaultRoles(cfg.halloweenRoleId ? [cfg.halloweenRoleId] : [])),
      row(new RoleSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-xp").setPlaceholder("Set 2× XP role").setMinValues(1).setMaxValues(1).setDefaultRoles(cfg.xpBoosterRoleId ? [cfg.xpBoosterRoleId] : [])),
      row(aBtn(owner, "settings-channels", "Channel settings", ButtonStyle.Primary, "📢"), aBtn(owner, "clear-settings", "Clear a setting", ButtonStyle.Danger, "🧹"), aBtn(owner, "home", "Admin console"))
    ]);
  }
  if (page === "settings-channels") {
    const cfg = await s.guildSettings.getAll(guildId);
    return panel("CHANNEL SETTINGS", "Choose where members can use Fukishokai commands. Candy-drop announcements are also posted in that channel. Admin logs stay in their separate channel.", [
      { name: "Commands + Candy drops", value: cfg.memberCommandsChannelId ? "<#" + cfg.memberCommandsChannelId + ">" : "Not set" },
      { name: "Admin logs", value: cfg.logChannelId ? "<#" + cfg.logChannelId + ">" : "Not set" }
    ], [
      row(new ChannelSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-member-channel").setPlaceholder("Set commands + Candy-drop channel").setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1).setDefaultChannels(cfg.memberCommandsChannelId ? [cfg.memberCommandsChannelId] : [])),
      row(new ChannelSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-log").setPlaceholder("Set admin log channel").setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1).setDefaultChannels(cfg.logChannelId ? [cfg.logChannelId] : [])),
      row(aBtn(owner, "settings", "Back to settings", ButtonStyle.Secondary))
    ]);
  }
  if (page === "clear-settings") {
    return panel("CLEAR SERVER SETTING", "Choose one setting to remove. This does not delete player data or rewards.", [],
      [row(new StringSelectMenuBuilder().setCustomId("admin:" + owner + ":clear-setting").setPlaceholder("Choose a setting to clear").setMinValues(1).setMaxValues(1).addOptions(
        { label: "Halloween reward role", value: "halloweenRoleId" },
        { label: "2× XP role", value: "xpBoosterRoleId" },
        { label: "Admin role", value: "adminRoleId" },
        { label: "Admin log channel", value: "logChannelId" },
        { label: "Member commands + Candy-drop channel", value: "memberCommandsChannelId" }
      )), row(aBtn(owner, "settings", "Back to settings"))], "warning");
  }
  if (page === "event") {
    const ev = await s.halloween.getEvent(guildId);
    const roleId = await s.guildSettings.get(guildId, "halloweenRoleId");
    return panel("HALLOWEEN EVENT CONTROL", "Start or stop the seasonal event. The configured reward role and event end date are used when starting.", [
      { name: "Status", value: ev ? (ev.enabled ? "🟢 Enabled" : "⚪ Disabled") + "\nEnds <t:" + Math.floor(new Date(ev.ends_at).getTime() / 1000) + ":F>" : "Not configured" },
      { name: "Reward role", value: roleId ? "<@&" + roleId + ">" : "Not selected — configure it under Server settings." },
      { name: "Final reward", value: "Members become eligible after claiming " + balancing.halloween.finalRoleQuestCount + " qualifying quests." }
    ], [
      row(aBtn(owner, "event-start", "Start / restart", ButtonStyle.Success, "▶️"), aBtn(owner, "event-stop-confirm", "Stop event", ButtonStyle.Danger, "⏹️")),
      row(aBtn(owner, "settings", "Configure role", ButtonStyle.Secondary, "⚙️"), aBtn(owner, "home", "Admin console"))
    ]);
  }
  if (page === "event-stop-confirm") {
    return panel("CONFIRM EVENT STOP", "Stopping the event disables new quest progress and claims. Existing player records and rewards remain saved. Continue?",
      [], [row(aBtn(owner, "event-stop", "Yes, stop event", ButtonStyle.Danger), aBtn(owner, "event", "Cancel"))], "warning");
  }
  if (page === "player") {
    if (!targetId) return panel("PLAYER MANAGEMENT", "Select a member to open their tools. Trusted bot administrators can manage player balances and progression.",
      [], [row(new UserSelectMenuBuilder().setCustomId("admin:" + owner + ":player-target").setPlaceholder("Select a server member").setMinValues(1).setMaxValues(1)), row(aBtn(owner, "home", "Admin console"))]);
    const p = await getPlayer(s.pool, guildId, targetId);
    const job = balancing.jobs.find((x) => x.id === p.job_id);
    return panel("PLAYER TOOLS", "Selected member: <@" + targetId + ">. Choose an action. Sensitive actions require owner access.",
      [
        { name: "Wallet", value: Number(p.wallet).toLocaleString() + " FC", inline: true },
        { name: "Bank", value: Number(p.bank).toLocaleString() + " FC", inline: true },
        { name: "Level", value: p.level + " · " + Number(p.xp).toLocaleString() + " XP", inline: true },
        { name: "Career", value: job ? job.name + " · Level " + p.job_level : "Unemployed", inline: true },
        { name: "Rebirths", value: (Number(p.prestige) || 0) + " · " + getRebirthMultiplier(Number(p.prestige) || 0).toLocaleString() + "× FC/XP", inline: true }
      ], [
        row(aBtn(owner, "grant-fc", "Grant FC", ButtonStyle.Success, "➕", targetId), aBtn(owner, "grant-xp", "Grant XP", ButtonStyle.Success, "⭐", targetId), aBtn(owner, "remove-fc", "Remove FC", ButtonStyle.Danger, "➖", targetId)),
        row(aBtn(owner, "set-level", "Set level", ButtonStyle.Secondary, "🎚️", targetId), aBtn(owner, "set-career", "Assign career", ButtonStyle.Secondary, "💼", targetId), aBtn(owner, "set-rebirth", "Set rebirth", ButtonStyle.Secondary, null, targetId)),
        row(aBtn(owner, "special-items", "Grant Mythic item", ButtonStyle.Primary, "🌟", targetId)),
        row(new UserSelectMenuBuilder().setCustomId("admin:" + owner + ":player-target").setPlaceholder("Choose another member").setMinValues(1).setMaxValues(1)),
        row(aBtn(owner, "player", "Member search"), aBtn(owner, "home", "Admin console"))
      ]);
  }
  if (page === "fairness") {
    if (!targetId) return panel("LEADERBOARD FAIRNESS", "Select a member to change their ranking eligibility. This tool is available to trusted bot administrators.",
      [{ name: "What exclusion does", value: "Hides a member from Wealth, Level, Lifetime Earned and Weekly Activity leaderboards. Their balance and progress are not changed." }],
      [row(new UserSelectMenuBuilder().setCustomId("admin:" + owner + ":fairness-target").setPlaceholder("Select a member").setMinValues(1).setMaxValues(1)), row(aBtn(owner, "home", "Admin console"))]);
    const result = await s.pool.query("SELECT reason FROM leaderboard_exclusions WHERE guild_id = $1 AND user_id = $2", [guildId, targetId]);
    return panel("LEADERBOARD ELIGIBILITY", "<@" + targetId + ">",
      [{ name: "Current status", value: result.rowCount ? "Excluded from competitive leaderboards." : "Eligible for competitive leaderboards." },
       ...(result.rowCount ? [{ name: "Reason", value: String(result.rows[0].reason).slice(0, 1000) }] : [])],
      [row(aBtn(owner, "exclude", "Exclude member", ButtonStyle.Danger, "🚫", targetId), aBtn(owner, "include", "Restore eligibility", ButtonStyle.Success, "✅", targetId)),
       row(new UserSelectMenuBuilder().setCustomId("admin:" + owner + ":fairness-target").setPlaceholder("Choose another member").setMinValues(1).setMaxValues(1)),
       row(aBtn(owner, "fairness", "Member search"), aBtn(owner, "home", "Admin console"))]);
  }
  if (page === "logs") {
    const r = await s.pool.query("SELECT actor_id, action, target_id, created_at FROM audit_logs WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 10", [guildId]);
    const lines = r.rows.map((x) => "<t:" + Math.floor(new Date(x.created_at).getTime() / 1000) + ":R> · **" + x.action.replace(/_/g, " ") + "**\nBy <@" + x.actor_id + ">" + (x.target_id ? " · Target <@" + x.target_id + ">" : ""));
    return panel("RECENT AUDIT HISTORY", lines.length ? lines.join("\n\n") : "No audit records have been written yet.",
      [{ name: "History", value: "Showing the 10 most recent records." }],
      [row(aBtn(owner, "logs", "Refresh history", ButtonStyle.Secondary, "🔄"), aBtn(owner, "home", "Admin console"))]);
  }
  return renderAdmin(guildId, owner, "home", s);
}

async function completeArenaAction(i, s, owner, result) {
  if (result.status === "won") {
    await recordMemberAction(i, s, "arena_boss_defeated",
      "defeated **" + result.boss.name + "** in the Rift Arena and earned " + result.reward.toLocaleString() + " FC.",
      { bossId: result.boss.id, reward: result.reward, xp: result.xp, turns: result.battle.turn });
    return i.editReply(panel("RIFT VICTORY  /  BOSS DEFEATED",
      "**" + result.boss.name + "** has fallen. Your reward is secured.",
      [
        { name: "FC reward", value: "+" + result.reward.toLocaleString() + " FC", inline: true },
        { name: "XP earned", value: "+" + result.xp.toLocaleString() + " XP", inline: true },
        { name: "Turns", value: String(result.battle.turn), inline: true },
        { name: "Next challenge", value: "The Arena is ready for your next encounter when its cooldown ends." }
      ], [row(btn(owner, "arena", "Return to Arena", ButtonStyle.Primary), btn(owner, "gear", "Manage gear")), navButton(owner)], "success"));
  }
  if (result.status === "lost") {
    await recordMemberAction(i, s, "arena_boss_attempt_failed",
      "was defeated by **" + result.boss.name + "** in the Rift Arena.",
      { bossId: result.boss.id, turns: result.battle.turn }, "warning");
    return i.editReply(panel("RIFT DEFEAT",
      "**" + result.boss.name + "** overcame you. Your battle record is saved; no FC fine was charged.",
      [{ name: "Turns survived", value: String(result.battle.turn) }],
      [row(btn(owner, "arena", "Arena menu", ButtonStyle.Primary), btn(owner, "gear", "Upgrade gear")), navButton(owner)], "warning"));
  }
  if (result.status === "escaped") {
    return i.editReply(panel("RIFT RETREAT", "You left the encounter. The Arena entry cooldown remains active.",
      [], [row(btn(owner, "arena", "Arena menu")), navButton(owner)], "warning"));
  }
  return i.editReply(await renderMenu(i.guildId, owner, "arena", s));
}

async function openMenu(i, s) {
  const payload = await renderMenu(i.guildId, i.user.id, "home", s);
  return i.editReply(payload);
}
async function openAdmin(i, s) {
  if (!await isAdmin(i, s)) return i.editReply(panel("ACCESS DENIED", "Only the server owner, bot owner, or configured Admin Role can open the administration console.", [], [], "error"));
  return i.editReply(await renderAdmin(i.guildId, i.user.id, "home", s));
}
async function rewardRole(i, roleId, reason) {
  if (!roleId) return { assigned: false, issue: "No Halloween reward role is configured." };
  try {
    const role = await i.guild.roles.fetch(roleId);
    if (!role) return { assigned: false, issue: "The reward role no longer exists." };
    if (role.id === i.guildId || role.managed) return { assigned: false, issue: "The selected role is managed by Discord or is @everyone. Select a normal server role." };
    const member = await i.guild.members.fetch(i.user.id);
    const bot = i.guild.members.me || await i.guild.members.fetchMe();
    if (member.id === i.guild.ownerId) return { assigned: false, issue: "Discord does not allow the bot to assign roles to the server owner." };
    if (!bot.permissions.has(PermissionFlagsBits.ManageRoles)) return { assigned: false, issue: "The bot needs Manage Roles permission." };
    if (bot.roles.highest.comparePositionTo(role) <= 0) return { assigned: false, issue: "Move the reward role below the bot's highest role." };
    if (member.roles.cache.has(role.id)) return { assigned: true, alreadyHadRole: true };
    await member.roles.add(role, reason);
    return { assigned: true, alreadyHadRole: false };
  } catch (error) {
    console.error("[event] Reward role assignment failed:", error.code || error.name, error.message);
    return { assigned: false, issue: "Discord rejected the role assignment. Check the bot permission and role hierarchy." };
  }
}
async function showWork(i, owner, session) {
  const q = session.challenge.questions[session.index];
  const total = session.challenge.questions.length;
  const levelMultiplier = getLevelEarningMultiplier(session.shift.playerLevel || 1);
  const remainingMinutes = Math.ceil((session.expiresAt - Date.now()) / 60000);
  const buttons = q.options.map((x) => new ButtonBuilder()
    .setCustomId("dash:" + owner + ":work-answer:" + session.id + ":" + session.index + ":" + x.letter)
    .setLabel(x.letter + " · " + x.value).setStyle(ButtonStyle.Secondary));
  const embed = createEmbed({
    title: "WORK SHIFT  /  QUESTION " + (session.index + 1) + " OF " + total,
    description: q.question + "\n\nChoose the correct answer below. This shift expires in about " + Math.max(1, remainingMinutes) + " minute(s).",
    color: settings.brand.primary, icon: "task",
    fields: [
      { name: "Career", value: session.shift.job.name + " · Level " + session.shift.jobLevel, inline: true },
      { name: "Correct so far", value: session.correct + "/" + session.index, inline: true },
      { name: "Difficulty", value: session.challenge.band.toUpperCase(), inline: true },
      { name: "Level-based pay", value: "+" + ((levelMultiplier - 1) * 100).toFixed(1) + "%", inline: true },
      { name: "Shift progress", value: bar(session.index, total) }
    ],
    footer: "FUKISHOKAI  •  Three questions per shift · Better answers earn more FC and XP"
  });
  return i.editReply({ embeds: [embed], components: [row(...buttons)] });
}

async function handleSelection(i, s, scope, owner, action, parts) {
  const value = i.values[0];
  if (scope === "dash" && action === "trade-target") {
    if (value === owner) throw new Error("You cannot trade with yourself.");
    const member = await i.guild.members.fetch(value).catch(() => null);
    if (!member || member.user.bot) throw new Error("Choose a real server member, not a bot or departed member.");
    const trade = await s.trades.create(i.guildId, owner, value);
    await member.send("You have a Fukishokai trade invitation from <@" + owner + ">. Open /menu → Trade to review and respond. The trade expires in 30 minutes.").catch(() => null);
    await safeAudit(i, s, "player_trade_created", value, { tradeId: trade.id });
    return i.update(await renderMenu(i.guildId, owner, "trade", s));
  }
  if (scope === "dash" && action === "trade-item") {
    const tradeId = parts[3];
    const inv = await s.inventory.getInventory(i.guildId, owner);
    const entry = inv.items.find(x => x.item.id === value && !x.item.boosterOnly);
    if (!entry) throw new Error("You do not own that tradable item.");
    return i.showModal(modal("dash:" + owner + ":trade-item-modal:" + tradeId + ":" + value, "Offer " + entry.item.name, [
      { id: "quantity", label: "Quantity (max " + Math.min(99, entry.quantity) + ")", placeholder: "1", max: 2 }
    ]));
  }
  if (scope === "dash" && action === "arena-start") {
    await i.deferUpdate();
    await s.arena.start(i.guildId, owner, value);
    return i.editReply(await renderMenu(i.guildId, owner, "arena", s));
  }
  if (scope === "dash" && action === "arena-ability") {
    await i.deferUpdate();
    const result = await s.arena.act(i.guildId, owner, "ability", value, memberRoleIds(i), parts[3]);
    return completeArenaAction(i, s, owner, result);
  }
  if (scope === "admin") {
    if (!await isAdmin(i, s)) return i.reply({ content: "Your admin access has changed. Reopen the panel after checking permissions.", flags: MessageFlags.Ephemeral });
    if (action === "player-target") return i.update(await renderAdmin(i.guildId, owner, "player", s, value));
    if (action === "special-item-target") return i.update(await renderAdmin(i.guildId, owner, "special-items", s, value));
    if (action === "special-item-grant") {
      const targetId = parts[3];
      if (!targetId) throw new Error("Choose a member before granting a Mythic item.");
      await i.deferUpdate();
      const result = await s.inventory.grantBoosterItem(i.guildId, targetId, value, { equip: true });
      const details = {
        itemId: result.item.id,
        itemName: result.item.name,
        boostNumber: result.item.boostNumber,
        alreadyOwned: result.alreadyOwned,
        autoEquipped: result.autoEquipped,
        previousEquippedItem: result.previousItem?.id || null
      };
      await audit(s.pool, i.guildId, owner, "admin_mythic_item_granted", targetId, details);
      await sendLog(i.client, i.guildId,
        "🌟 **" + result.item.name + "** was " + (result.alreadyOwned ? "re-granted and equipped" : "granted and equipped") +
        " for <@" + targetId + "> by <@" + owner + ">.");
      return i.editReply(panel(
        result.alreadyOwned ? "MYTHIC ITEM ALREADY OWNED" : "MYTHIC ITEM GRANTED",
        "**" + result.item.name + "** " + (result.alreadyOwned ? "was already in the member's collection; no duplicate was created." : "was added to the member's inventory.") +
        "\n\nRecipient: <@" + targetId + ">\n**It is now equipped automatically.**" +
        (result.previousItem ? "\nReplaced in the " + result.item.slot + " slot: **" + result.previousItem.name + "**." : ""),
        [
          { name: "Item", value: "MYTHIC #" + result.item.boostNumber + " · " + result.item.name },
          { name: "Bonuses", value: result.item.rewardSummary || result.item.description },
          { name: "Upgrades", value: (result.upgradeLevel || 0) + "/" + balancing.itemUpgrades.maxLevel }
        ],
        [row(aBtn(owner, "special-items", "Grant another item", ButtonStyle.Primary, "🌟", targetId), aBtn(owner, "player", "Player tools", ButtonStyle.Secondary, null, targetId)), row(aBtn(owner, "home", "Admin console"))],
        "success"
      ));
    }
    if (action === "custom-command-select") return i.update(await renderAdmin(i.guildId, owner, "custom-command", s, value));
    if (action === "fairness-target") {
      if (!await isAdmin(i, s)) return i.reply({ content: "Only the server owner, bot owner, or configured Admin Role can change leaderboard eligibility.", flags: MessageFlags.Ephemeral });
      return i.update(await renderAdmin(i.guildId, owner, "fairness", s, value));
    }
    if (action === "clear-setting") {
      const allowed = ["halloweenRoleId", "xpBoosterRoleId", "adminRoleId", "logChannelId", "memberCommandsChannelId"];
      if (!allowed.includes(value)) throw new Error("Unknown server setting.");
      const actorWasTrusted = value === "adminRoleId" && await s.security.isAboveBotRole(i.guild, owner);
      await i.deferUpdate();
      await s.guildSettings.clear(i.guildId, value);
      if (value === "adminRoleId") s.security.clearHierarchyCache();
      if (!actorWasTrusted) {
        await safeAudit(i, s, "server_setting_cleared", null, { setting: value });
        await safeSendLog(i, s, value + " cleared by <@" + owner + ">.");
      }
      return i.editReply(await renderAdmin(i.guildId, owner, "settings", s));
    }
    if (action.startsWith("setting-")) {
      await i.deferUpdate();
      const map = {
        "setting-reward": ["halloweenRoleId", "Halloween reward role"],
        "setting-xp": ["xpBoosterRoleId", "2x XP role"],
        "setting-admin": ["adminRoleId", "Trusted Admin Role"],
        "setting-log": ["logChannelId", "Admin log channel"],
        "setting-member-channel": ["memberCommandsChannelId", "Member commands and Candy-drop channel"]
      };
      const setting = map[action];
      if (!setting) throw new Error("Unknown server setting.");
      const actorWasTrusted = setting[0] === "adminRoleId" && await s.security.isAboveBotRole(i.guild, owner);
      if (setting[0] === "halloweenRoleId" || setting[0] === "adminRoleId") {
        const role = await i.guild.roles.fetch(value);
        if (!role || role.id === i.guildId || role.managed) {
          const label = setting[0] === "adminRoleId" ? "trusted Admin Role" : "Halloween reward";
          return i.followUp({ content: "That role cannot be used as the " + label + " role. Choose a normal server role, not @everyone or an integration-managed role.", flags: MessageFlags.Ephemeral });
        }
      }
      await s.guildSettings.set(i.guildId, setting[0], value, owner);
      if (setting[0] === "adminRoleId") s.security.clearHierarchyCache();
      if (!actorWasTrusted) {
        await safeAudit(i, s, "server_setting_updated", null, { setting: setting[0], value });
        await safeSendLog(i, s, setting[1] + " updated by <@" + owner + ">.");
      }
      return i.editReply(await renderAdmin(i.guildId, owner, "settings", s));
    }
    if (action === "career-select") {
      if (!await isAdmin(i, s)) return i.reply({ content: "Only the server owner, bot owner, or configured Admin Role can assign careers.", flags: MessageFlags.Ephemeral });
      return i.showModal(modal("admin:" + owner + ":career-modal:" + parts[3] + ":" + value, "Assign a career", [
        { id: "level", label: "Job level (1–30)", placeholder: "1", max: 2 },
        { id: "reason", label: "Audit reason", paragraph: true, max: 500 }
      ]));
    }
  }

  if (scope !== "dash") return;
  if (action === "job-apply") {
    await i.deferUpdate();
    const result = await s.jobs.apply(i.guildId, owner, value);
    await recordMemberAction(i, s, "career_applied", "applied for **" + result.job.name + "**.", { careerId: result.job.id, careerName: result.job.name });
    return i.editReply(panel("CAREER CONFIRMED", "You are now a **" + result.job.name + "**.\n" + result.job.description + "\n\nYour career is ready. Open Earn to start a shift.", [
      { name: "Starting pay", value: result.job.payMin.toLocaleString() + "–" + result.job.payMax.toLocaleString() + " FC", inline: true },
      { name: "Cooldown", value: Math.round(result.job.cooldownMs / 60000) + " minutes", inline: true }
    ], [row(btn(owner, "earn", "Go to Earn", ButtonStyle.Success)), navButton(owner)], "success"));
  }
  if (action === "equip" || action === "unequip" || action === "shop-buy" || action === "upgrade-item" || action === "crime-run" || action === "event-claim" || action === "event-buy" || action === "ranking-type" || action === "achievement-claim" || action === "weekly-quest-claim") {
    await i.deferUpdate();
    if (action === "weekly-quest-claim") {
      const result = await s.weeklyQuests.claim(i.guildId, owner, value);
      await recordMemberAction(i, s, "weekly_quest_claimed",
        "claimed the weekly quest **" + result.quest.name + "** and received " + result.candy + " Candy.",
        { questId: result.quest.id, weekStart: result.weekStart, candy: result.candy });
      return i.editReply(panel("WEEKLY QUEST CLAIMED", "**" + result.quest.name + "** · +" + result.candy + " Candy",
        [{ name: "Candy balance", value: result.candyBalance.toLocaleString() }],
        [row(btn(owner, "weekly", "Back to weekly quests")), navButton(owner)], "success"));
    }
    if (action === "achievement-claim") {
      const result = await s.achievements.claim(i.guildId, owner, value, memberRoleIds(i));
      await recordMemberAction(i, s, "achievement_claimed",
        "claimed the **" + result.achievement.name + "** achievement and received " + result.rewardFc.toLocaleString() + " FC.",
        { achievementId: result.achievement.id, rewardFc: result.rewardFc, rewardXp: result.rewardXp });
      return i.editReply(panel("ACHIEVEMENT CLAIMED", "**" + result.achievement.name + "**\n" + result.achievement.description,
        [
          { name: "FC reward", value: "+" + result.rewardFc.toLocaleString() + " FC", inline: true },
          { name: "XP reward", value: "+" + result.rewardXp.toLocaleString() + " XP", inline: true },
          { name: "Player level", value: String(result.level), inline: true },
          ...(result.candyDrop ? [{ name: "Candy found", value: "+" + result.candyDrop.amount, inline: true }] : [])
        ], [row(btn(owner, "achievements", "Achievement book")), navButton(owner)], "success"));
    }
    if (action === "equip") {
      const r = await s.inventory.equip(i.guildId, owner, value);
      await recordMemberAction(i, s, "equipment_equipped", "equipped **" + r.item.name + "**.", { itemId: r.item.id, slot: r.item.slot });
      return i.editReply(panel("EQUIPMENT UPDATED", "Equipped **" + r.item.name + "** in the **" + r.item.slot + "** slot." + (r.previousItem ? "\nReplaced: " + r.previousItem.name : ""), [], [row(btn(owner, "gear", "View gear")), navButton(owner)], "success"));
    }
    if (action === "unequip") {
      const r = await s.inventory.unequip(i.guildId, owner, value);
      await recordMemberAction(i, s, "equipment_unequipped", "unequipped **" + r.item.name + "**.", { itemId: r.item.id, slot: r.slot });
      return i.editReply(panel("GEAR UNEQUIPPED", "Removed **" + r.item.name + "** from your " + r.slot + " slot. The item remains in your inventory.", [], [row(btn(owner, "gear", "View gear")), navButton(owner)], "success"));
    }
    if (action === "shop-buy") {
      const r = await s.inventory.buy(i.guildId, owner, value);
      await recordMemberAction(i, s, "shop_purchase", "purchased **" + r.item.name + "** for " + r.item.cost.toLocaleString() + " FC.", { itemId: r.item.id, cost: r.item.cost });
      return i.editReply(panel("PURCHASE COMPLETE", "You purchased **" + r.item.name + "**.\n" + r.item.description, [{ name: "Wallet remaining", value: r.walletRemaining.toLocaleString() + " FC" }], [row(btn(owner, "gear", "View gear")), navButton(owner)], "success"));
    }
    if (action === "upgrade-item") {
      const r = await s.inventory.upgrade(i.guildId, owner, value);
      await recordMemberAction(i, s, "equipment_upgraded", "upgraded **" + r.item.name + "** to level " + r.upgradeLevel + " for " + r.cost.toLocaleString() + " FC.", { itemId: r.item.id, upgradeLevel: r.upgradeLevel, cost: r.cost });
      return i.editReply(panel("GEAR UPGRADED", "**" + r.item.name + "** is now at upgrade level **" + r.upgradeLevel + "/" + balancing.itemUpgrades.maxLevel + "**. Its effects are stronger while equipped.",
        [{ name: "Upgrade cost", value: r.cost.toLocaleString() + " FC", inline: true }, { name: "Wallet remaining", value: r.walletRemaining.toLocaleString() + " FC", inline: true }],
        [row(btn(owner, "gear", "View gear")), navButton(owner)], "success"));
    }
    if (action === "crime-run") {
      const r = await s.crime.attempt(i.guildId, owner, value, memberRoleIds(i));
      const candyText = r.candyDrop ? " and found **" + r.candyDrop.amount + " Candy**" : "";
      await recordMemberAction(i, s, "crime_attempt", r.succeeded
        ? "completed **" + r.crime.name + "** and earned " + r.reward.toLocaleString() + " FC" + candyText + "."
        : "attempted **" + r.crime.name + "** and paid a " + r.fine.toLocaleString() + " FC fine.",
        { crimeId: r.crime.id, succeeded: r.succeeded, reward: r.reward, fine: r.fine, candy: r.candyDrop?.amount || 0, successChance: r.successChance }, r.succeeded ? "success" : "warning");
      return i.editReply(panel(r.succeeded ? "OPERATION SUCCESSFUL" : "OPERATION FAILED",
        r.succeeded ? "You completed **" + r.crime.name + "** and earned **" + r.reward.toLocaleString() + " FC**." + (r.candyDrop ? "\n🍬 You found **" + r.candyDrop.amount + " Candy**!" : "") : "You were caught during **" + r.crime.name + "** and paid a fine of **" + r.fine.toLocaleString() + " FC**.",
        [{ name: "Success chance", value: r.successChance + "%", inline: true }, { name: r.succeeded ? "Reward" : "Fine", value: (r.succeeded ? r.reward : r.fine).toLocaleString() + " FC", inline: true }, ...(r.candyDrop ? [{ name: "Candy found", value: "+" + r.candyDrop.amount, inline: true }] : [])],
        [row(btn(owner, "crime", "Back to crime")), navButton(owner)], r.succeeded ? "success" : "warning"));
    }
    if (action === "event-claim") {
      const r = await s.halloween.claimQuest(i.guildId, owner, value);
      const configured = await s.guildSettings.get(i.guildId, "halloweenRoleId");
      const selectedRewardRole = configured || r.roleId;
      let note = "";
      if (r.eligibleForRole && selectedRewardRole) {
        const assigned = await rewardRole(i, selectedRewardRole, "Completed the Halloween quest requirement");
        if (!assigned.assigned) note = "\n\n**Reward role not assigned:** " + assigned.issue;
      }
      await recordMemberAction(i, s, "halloween_quest_claimed", "claimed the **" + r.quest.name + "** quest and received " + r.quest.candy + " Candy.", { questId: r.quest.id, candy: r.quest.candy, points: r.quest.points });
      return i.editReply(panel("QUEST CLAIMED", "**" + r.quest.name + "** completed. You received **" + r.quest.candy + " Candy** and **" + r.quest.points + " event points**." + note,
        [{ name: "Final role progress", value: r.claimedCount + "/" + balancing.halloween.finalRoleQuestCount + " claims" }],
        [row(btn(owner, "event", "Back to Halloween")), navButton(owner)], "success"));
    }
    if (action === "event-buy") {
      const r = await s.halloween.buyItem(i.guildId, owner, value);
      await recordMemberAction(i, s, "halloween_item_purchased", "purchased the seasonal item **" + r.item.name + "** for " + r.item.cost + " Candy.", { itemId: r.item.id, cost: r.item.cost });
      return i.editReply(panel("SEASONAL ITEM PURCHASED", "You bought **" + r.item.name + "**.\n" + r.item.description, [{ name: "Candy remaining", value: r.remainingCandy.toLocaleString() }], [row(btn(owner, "event", "Back to Halloween")), navButton(owner)], "success"));
    }
    if (action === "ranking-type") {
      return i.editReply(await leaderboardPayload({ guild: i.guild, pool: s.pool, owner, metric: value, page: 0 }));
    }
  }
  if (action === "heist-create") {
    await i.deferUpdate();
    const r = await s.heists.create(i.guildId, owner, value);
    const board = await publishNewHeistBoard(i, s, r.id).catch((error) => {
      console.warn("[heists] Public crew board could not be created:", error.code || error.message);
      return { posted: false, note: "The public crew board could not be posted. Check that the bot can send messages in this channel." };
    });
    await safeAudit(i, s, "heist_created", owner, { missionId: r.mission.id });
    await safeSendLog(i, s, "A new heist crew was created for " + r.mission.name + ".");
    const roster = board.snapshot ? getHeistCrewLines(board.snapshot.crew).join("\n") : "<@" + owner + "> — Planner";
    return i.editReply(panel("CREW CREATED  /  RECRUITING", "**" + r.mission.name + "** is ready. The public crew board " +
      (board.posted ? "has been posted in <#" + board.channel.id + "> and will update as members join." : "could not be posted. " + board.note), [
      { name: "HEIST ID", value: "||" + r.id + "||" },
      { name: "Current crew", value: roster },
      { name: "Crew size", value: "Minimum " + r.mission.minParticipants + " · Maximum " + r.mission.maxParticipants },
      ...(board.posted ? [{ name: "Live crew board", value: "[Open the crew board](" + board.message.url + ")" }] : [])
    ], [row(new ButtonBuilder().setCustomId("dash:" + owner + ":copy:" + r.id).setLabel("Show copyable ID").setStyle(ButtonStyle.Primary)), row(btn(owner, "heists", "Heist menu")), navButton(owner)], "success"));
  }
  if (action === "heist-join-role") {
    await i.deferUpdate();
    const heistId = parts[3];
    const r = await s.heists.join(i.guildId, owner, heistId, value);
    const board = await refreshHeistBoard(i, s, heistId).catch((error) => {
      console.warn("[heists] Crew board update failed:", error.code || error.message);
      return { posted: false, snapshot: null };
    });
    const snapshot = board.snapshot || await s.heists.status(i.guildId, heistId);
    await announceHeistJoin(i, snapshot, owner, r.role.label);
    await safeAudit(i, s, "heist_joined", owner, { heistId, role: r.role.label, leaderId: r.leaderId });
    await safeSendLog(i, s, "A member joined " + r.mission.name + " as " + r.role.label + ".");
    return i.editReply(panel("YOU JOINED THE CREW", "You joined **" + r.mission.name + "** as **" + r.role.label + "**. The leader's public crew board has been updated.",
      [
        { name: "Current crew", value: getHeistCrewLines(snapshot.crew).join("\n").slice(0, 1000) },
        { name: "Crew size", value: r.count + "/" + r.maximum, inline: true },
        { name: "Leader", value: "<@" + r.leaderId + ">", inline: true },
        ...(board.posted ? [{ name: "Crew board", value: "[Open the updated crew board](" + board.message.url + ")" }] : [])
      ], [row(btn(owner, "heists", "Heist menu")), navButton(owner)], "success"));
  }
}

function getHeistCrewLines(crew) {
  return crew.map((member) => {
    const role = balancing.heistRoles[member.role_id] || { label: "Crew member" };
    return "<@" + member.user_id + "> — **" + role.label + "**";
  });
}

function buildHeistEmbed(snapshot) {
  const heist = snapshot.heist;
  const mission = balancing.heists.find((item) => item.id === heist.mission_id);
  const crewLines = getHeistCrewLines(snapshot.crew);
  const recruiting = heist.status === "recruiting";
  const succeeded = heist.status === "success";
  const statusLabel = recruiting ? "RECRUITING" : succeeded ? "MISSION SUCCESS" : heist.status === "failed" ? "MISSION FAILED" : heist.status.toUpperCase();
  const description = recruiting
    ? "A crew is being assembled for **" + (mission ? mission.name : "the mission") + "**. The crew board updates whenever someone joins."
    : succeeded
      ? "The crew completed **" + (mission ? mission.name : "the mission") + "** and secured **" + Number(heist.total_payout).toLocaleString() + " FC** in total."
      : heist.status === "failed"
        ? "The crew's attempt at **" + (mission ? mission.name : "the mission") + "** was unsuccessful. The mission result has been recorded."
        : "**" + (mission ? mission.name : "The mission") + "**";
  const fields = [
    { name: "Mission leader", value: "<@" + heist.leader_id + ">", inline: true },
    { name: "Crew size", value: snapshot.crew.length + "/" + (mission ? mission.maxParticipants : snapshot.crew.length), inline: true },
    { name: "Crew members and roles", value: crewLines.length ? crewLines.join("\n").slice(0, 1000) : "No crew members yet." },
    { name: "Crew ID", value: heist.id }
  ];
  if (!recruiting && heist.success_chance != null) {
    fields.push({ name: "Success chance", value: heist.success_chance + "%", inline: true });
    fields.push({ name: "Final roll", value: String(heist.roll), inline: true });
    if (succeeded) fields.push({ name: "Team payout", value: Number(heist.total_payout).toLocaleString() + " FC", inline: true });
  } else if (mission) {
    fields.push({ name: "Minimum crew", value: mission.minParticipants + " members", inline: true });
  }
  return createEmbed({
    title: "FUKISHOKAI  /  HEIST CREW  ·  " + statusLabel,
    description,
    fields,
    color: recruiting ? settings.brand.primary : succeeded ? settings.brand.success : settings.brand.danger,
    icon: "task",
    footer: false
  });
}

async function getPublicTextChannel(i, channelId = i.channelId) {
  if (!channelId) return null;
  const channel = await i.client.channels.fetch(channelId).catch(() => null);
  return channel && channel.isTextBased() && typeof channel.send === "function" ? channel : null;
}

async function sendHeistEmbed(channel, embed, fallbackText) {
  try {
    return await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (_) {
    return channel.send({ content: fallbackText, allowedMentions: { parse: [] } });
  }
}

async function publishNewHeistBoard(i, s, heistId) {
  const channel = await getPublicTextChannel(i);
  if (!channel) return { posted: false, note: "The bot could not post the crew board in this channel. Check its send-message permission." };
  const snapshot = await s.heists.status(i.guildId, heistId);
  const mission = balancing.heists.find((item) => item.id === snapshot.heist.mission_id);
  const message = await sendHeistEmbed(
    channel,
    buildHeistEmbed(snapshot),
    "HEIST CREW · " + (mission ? mission.name : "Mission") + "\nLeader: <@" + snapshot.heist.leader_id + ">\nCrew: " + getHeistCrewLines(snapshot.crew).join(" | ") + "\nCrew ID: " + heistId
  );
  await s.heists.setAnnouncement(i.guildId, heistId, channel.id, message.id);
  return { posted: true, channel, message, snapshot };
}

async function refreshHeistBoard(i, s, heistId) {
  const snapshot = await s.heists.status(i.guildId, heistId);
  let channel = snapshot.heist.announcement_channel_id
    ? await getPublicTextChannel(i, snapshot.heist.announcement_channel_id)
    : null;
  if (!channel) channel = await getPublicTextChannel(i);
  if (!channel) return { posted: false, snapshot };
  const embed = buildHeistEmbed(snapshot);
  let message = null;
  if (snapshot.heist.announcement_message_id && channel.messages?.fetch) {
    message = await channel.messages.fetch(snapshot.heist.announcement_message_id).catch(() => null);
  }
  if (message) {
    try {
      await message.edit({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (_) {
      message = null;
    }
  }
  if (!message) {
    const mission = balancing.heists.find((item) => item.id === snapshot.heist.mission_id);
    message = await sendHeistEmbed(
      channel,
      embed,
      "HEIST CREW · " + (mission ? mission.name : "Mission") + "\nCrew: " + getHeistCrewLines(snapshot.crew).join(" | ") + "\nCrew ID: " + heistId
    );
    await s.heists.setAnnouncement(i.guildId, heistId, channel.id, message.id);
  }
  return { posted: true, channel, message, snapshot };
}

async function announceHeistJoin(i, snapshot, joiningUserId, roleLabel) {
  const channel = snapshot.heist.announcement_channel_id
    ? await getPublicTextChannel(i, snapshot.heist.announcement_channel_id)
    : await getPublicTextChannel(i);
  if (!channel) return;
  const mission = balancing.heists.find((item) => item.id === snapshot.heist.mission_id);
  const embed = createEmbed({
    title: "HEIST CREW  /  NEW MEMBER",
    description: "<@" + joiningUserId + "> joined **" +
      (mission ? mission.name : "the mission") + "** as **" + roleLabel + "**.",
    fields: [
      { name: "Current crew", value: snapshot.crew.length + "/" +
        (mission ? mission.maxParticipants : snapshot.crew.length), inline: true },
      { name: "Crew roster", value: getHeistCrewLines(snapshot.crew).join("\n").slice(0, 1000) }
    ],
    color: settings.brand.primary,
    icon: "profile",
    footer: "FUKISHOKAI  •  Crew board updated"
  });
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(async () => {
    await channel.send({
      content: "HEIST CREW UPDATE · <@" + joiningUserId + "> joined as " + roleLabel + ".",
      allowedMentions: { parse: [] }
    }).catch(() => null);
  });
}

async function announceHeistResult(i, snapshot, crewRewards = []) {
  const channel = snapshot.heist.announcement_channel_id
    ? await getPublicTextChannel(i, snapshot.heist.announcement_channel_id)
    : await getPublicTextChannel(i);
  if (!channel) return;
  const embed = buildHeistEmbed(snapshot);
  const candyLines = crewRewards
    .filter((member) => member.candyDrop)
    .map((member) => "<@" + member.userId + "> found +" + member.candyDrop.amount + " Candy");
  if (candyLines.length && typeof embed.addFields === "function") {
    embed.addFields({ name: "🍬 Candy discoveries", value: candyLines.join("\n").slice(0, 1000) });
  }
  await sendHeistEmbed(
    channel,
    embed,
    "HEIST RESULT · " + (snapshot.heist.status === "success" ? "SUCCESS" : "FAILED") +
      "\nCrew: " + getHeistCrewLines(snapshot.crew).join(" | ") +
      "\nTeam payout: " + Number(snapshot.heist.total_payout).toLocaleString() + " FC" +
      (candyLines.length ? "\nCandy discoveries: " + candyLines.join(" · ") : "")
  ).catch(() => null);
}

function navButton(owner) { return row(btn(owner, "home", "Dashboard")); }

async function handleButton(i, s) {
  const p = i.customId.split(":");
  const scope = p[0], owner = p[1], action = p[2];
  if (i.user.id !== owner) {
    await s.security.recordUnauthorizedControlAttempt(i, i.customId).catch(() => {});
    return i.reply({ content: "This private dashboard belongs to another member. Run /menu to open your own.", flags: MessageFlags.Ephemeral });
  }
  if (scope === "admin" && !await isAdmin(i, s)) return i.reply({ content: "You no longer have permission to use this control.", flags: MessageFlags.Ephemeral });
  if (scope === "admin") {
    const target = p[3];
    if (action === "fairness" && !await isAdmin(i, s)) {
      return i.reply({ content: "Only the server owner or configured bot owner can manage leaderboard eligibility.", flags: MessageFlags.Ephemeral });
    } 
    if (action === "custom-commands") {
      return i.update(await renderAdmin(i.guildId, owner, "custom-commands", s));
    }
    if (action === "custom-command-create" || action === "custom-command-edit") {
      return i.reply({ content: "Custom slash commands are created and edited as JavaScript files in Code Studio. Open /admin panel → Custom commands and choose Open Code Studio.", flags: MessageFlags.Ephemeral });
    }
    if (action === "custom-command-deploy") {
      await i.deferUpdate();
      try {
        const deployment = await s.customCommands.deployGuild(i.guildId);
        await safeAudit(i, s, "custom_commands_deployed", null, { guildId: i.guildId, ...deployment });
        await safeSendLog(i, s, "Custom slash commands were deployed by <@" + owner + ">.");
        const page = target ? "custom-command" : "custom-commands";
        const payload = await renderAdmin(i.guildId, owner, page, s, target);
        if (payload.embeds?.[0]) payload.embeds[0].addFields({ name: "Deployment", value: "Registered " + deployment.registeredCount + " slash commands. No bot restart was required. Select a command and press Activate." });
        return i.editReply(payload);
      } catch (error) {
        console.error("[custom-commands] Deployment failed:", error.code || error.name, error.message);
        return i.editReply(panel("DEPLOYMENT FAILED", "The slash commands could not be deployed. Check the host logs and deployment configuration, then try again.",
          [{ name: "Next step", value: "Confirm the bot is online, the database is reachable and the deployment script is present on the host." }],
          [row(aBtn(owner, "custom-commands", "Back to custom commands"), aBtn(owner, "home", "Admin console"))], "error"));
      }
    }
    if (action === "custom-command-activate" || action === "custom-command-deactivate") {
      await i.deferUpdate();
      const result = action === "custom-command-activate"
        ? await s.customCommands.activate(i.guildId, target, owner)
        : await s.customCommands.deactivate(i.guildId, target, owner);
      await safeAudit(i, s, action === "custom-command-activate" ? "custom_command_activated" : "custom_command_deactivated", target, { name: result.name });
      await safeSendLog(i, s, "Custom command /" + result.name + " " + (action === "custom-command-activate" ? "activated" : "deactivated") + " by <@" + owner + ">.");
      return i.editReply(await renderAdmin(i.guildId, owner, "custom-command", s, target));
    }
    if (action === "custom-command-delete") {
      await i.deferUpdate();
      const removed = await s.customCommands.remove(i.guildId, target, owner);
      await safeAudit(i, s, "custom_command_deleted", target, { name: removed.name });
      await s.customCommands.deployGuild(i.guildId);
      await safeAudit(i, s, "custom_commands_deployed", null, { guildId: i.guildId, reason: "command_deleted" });
      await safeSendLog(i, s, "Custom command /" + removed.name + " was removed from Discord by <@" + owner + ">.");
      return i.editReply(await renderAdmin(i.guildId, owner, "custom-commands", s));
    }
    if (action === "home" || action === "refresh" || action === "settings" || action === "settings-channels" || action === "clear-settings" || action === "event" || action === "player" || action === "fairness" || action === "logs" || action === "event-stop-confirm" || action === "special-items") {
      return i.update(await renderAdmin(i.guildId, owner, action === "refresh" ? "home" : action, s, target));
    }
    if (["grant-fc", "grant-xp", "remove-fc", "set-level"].includes(action)) {
      if (!await isAdmin(i, s)) return i.reply({ content: "Only the server owner, bot owner, or configured Admin Role can edit member currency and progression.", flags: MessageFlags.Ephemeral });
      const isLevel = action === "set-level";
      return i.showModal(modal("admin:" + owner + ":" + action + ":" + target, isLevel ? "Set player level" : action === "remove-fc" ? "Remove FS Coins" : action === "grant-xp" ? "Grant XP" : "Grant FS Coins", [
        { id: isLevel ? "level" : "amount", label: isLevel ? "New level (1–600)" : "Amount", placeholder: isLevel ? "10" : "1000", max: 12 },
        { id: "reason", label: "Audit reason", paragraph: true, max: 500 }
      ]));
    }
    if (action === "set-career") {
      if (!await isAdmin(i, s)) return i.reply({ content: "Only the server owner, bot owner, or configured Admin Role can assign careers.", flags: MessageFlags.Ephemeral });
      const opts = balancing.jobs.map((j) => ({ label: j.name, value: j.id, description: "Assign " + j.name }));
      const careerMenu = new StringSelectMenuBuilder().setCustomId("admin:" + owner + ":career-select:" + target).setPlaceholder("Choose a career").setMinValues(1).setMaxValues(1).addOptions(opts);
      return i.update(panel("ASSIGN CAREER", "Choose the career to assign to <@" + target + ">.", [], [row(careerMenu), row(aBtn(owner, "player", "Back to player tools", ButtonStyle.Secondary, null, target))]));
    }
    if (action === "set-rebirth") {
      return i.showModal(modal("admin:" + owner + ":set-rebirth:" + target, "Set rebirth count", [
        { id: "rebirths", label: "New rebirth count (0–100)", placeholder: "4", max: 3 },
        { id: "reason", label: "Audit reason", paragraph: true, max: 500 }
      ]));
    }
    if (action === "exclude") {
      if (!await isAdmin(i, s)) return i.reply({ content: "Only the server owner, bot owner, or configured Admin Role can change leaderboard eligibility.", flags: MessageFlags.Ephemeral });
      return i.showModal(modal("admin:" + owner + ":exclude-modal:" + target, "Exclude from leaderboards", [
        { id: "reason", label: "Reason for exclusion", paragraph: true, max: 500 }
      ]));
    }
    if (action === "include") {
      if (!await isAdmin(i, s)) return i.reply({ content: "Only the server owner, bot owner, or configured Admin Role can change leaderboard eligibility.", flags: MessageFlags.Ephemeral });
      await i.deferUpdate();
      await s.economy.includeInLeaderboards(i.guildId, target);
      await safeAudit(i, s, "leaderboard_member_included", target, {});
      await safeSendLog(i, s, "Leaderboard eligibility restored by <@" + owner + "> for <@" + target + ">.");
      return i.editReply(await renderAdmin(i.guildId, owner, "fairness", s, target));
    }
    if (action === "event-start" || action === "event-stop") {
      await i.deferUpdate();
      if (action === "event-start") {
        const roleId = await s.guildSettings.get(i.guildId, "halloweenRoleId");
        const result = await s.halloween.startEvent(i.guildId, owner, roleId);
        await safeAudit(i, s, "halloween_event_started", null, { eventId: result.eventId, roleId: result.roleId, endsAt: result.endsAt });
        await safeSendLog(i, s, "Halloween event started by <@" + owner + ">.");
      } else {
        await s.halloween.stopEvent(i.guildId, owner);
        await safeAudit(i, s, "halloween_event_stopped", null, {});
        await safeSendLog(i, s, "Halloween event stopped by <@" + owner + ">.");
      }
      return i.editReply(await renderAdmin(i.guildId, owner, "event", s));
    }
    return i.reply({ content: "That control is not available.", flags: MessageFlags.Ephemeral });
  }

  if (scope !== "dash") return;
  if (action === "leaderboard-page") {
    return i.update(await leaderboardPayload({ guild: i.guild, pool: s.pool, owner, metric: p[3], page: Number(p[4]) || 0 }));
  }
  if (action === "leaderboard-search") {
    return i.showModal(modal("dash:" + owner + ":leaderboard-search-modal:" + p[3] + ":" + p[4], "Search server members", [
      { id: "query", label: "Username, display name or Discord ID", placeholder: "Search members", max: 80 }
    ]));
  }
  if (action === "trade-fc") {
    const trade = await s.trades.get(i.guildId, p[3]);
    if (!trade || trade.status !== "open") throw new Error("This trade is no longer open.");
    const side = trade.initiator_id === owner ? "initiator" : "target";
    return i.showModal(modal("dash:" + owner + ":trade-fc-modal:" + trade.id, "Set your FC offer", [
      { id: "amount", label: "FC amount (0 removes FC from offer)", placeholder: String(trade.offers[side].fc || 0), max: 16 }
    ]));
  }
  if (action === "trade-confirm") {
    await i.deferUpdate();
    const result = await s.trades.confirm(i.guildId, p[3], owner);
    if (result.completed) {
      await safeAudit(i, s, "player_trade_completed", null, { tradeId: p[3], initiatorId: result.trade.initiator_id, targetId: result.trade.target_id });
      return i.editReply(panel("TRADE COMPLETED", "Both members confirmed. FC and items have been exchanged successfully.", [], [row(btn(owner, "trade", "Back to Trade")), navButton(owner)], "success"));
    }
    return i.editReply(await renderMenu(i.guildId, owner, "trade", s));
  }
  if (action === "trade-cancel") {
    await i.deferUpdate();
    await s.trades.cancel(i.guildId, p[3], owner);
    await safeAudit(i, s, "player_trade_cancelled", null, { tradeId: p[3] });
    return i.editReply(panel("TRADE CANCELLED", "No FC or items were exchanged.", [], [row(btn(owner, "trade", "Back to Trade")), navButton(owner)], "warning"));
  }
  if (action === "arena-attack") {
    await i.deferUpdate();
    const result = await s.arena.act(i.guildId, owner, "attack", null, memberRoleIds(i), p[3]);
    return completeArenaAction(i, s, owner, result);
  }
  if (action === "arena-escape") {
    await i.deferUpdate();
    const result = await s.arena.escape(i.guildId, owner);
    return completeArenaAction(i, s, owner, result);
  }
  if (action === "copy") return i.reply({ content: "Heist ID: " + p[3], flags: MessageFlags.Ephemeral });
  if (action === "event") {
    await i.deferUpdate();
    const status = await s.halloween.status(i.guildId, owner);
    const configuredRole = await s.guildSettings.get(i.guildId, "halloweenRoleId");
    const roleId = configuredRole || (status.event && status.event.role_id);
    let roleNotice = "";
    if (status.event && status.claims.length >= balancing.halloween.finalRoleQuestCount && roleId) {
      const assignment = await rewardRole(i, roleId, "Completed the Halloween final reward requirement");
      if (!assignment.assigned) roleNotice = assignment.issue;
    }
    const payload = await renderMenu(i.guildId, owner, "event", s);
    if (roleNotice && payload.embeds[0]) payload.embeds[0].addFields({ name: "Final reward role", value: roleNotice });
    return i.editReply(payload);
  }
  const pages = ["home", "profile", "earn", "career", "bank", "trade", "gear", "shop", "games", "arena", "crime", "casino", "heists", "weekly", "event-shop", "rankings", "rebirth", "achievements", "help"];
  if (pages.includes(action)) return i.update(await renderMenu(i.guildId, owner, action, s));
  if (action === "refresh") return i.update(await renderMenu(i.guildId, owner, "home", s));
  if (action === "rebirth-review") return i.update(await renderMenu(i.guildId, owner, "rebirth-confirm", s));
  if (action === "rebirth-confirm") {
    await i.deferUpdate();
    const result = await s.economy.rebirth(i.guildId, owner);
    await recordMemberAction(i, s, "player_rebirth", "completed Rebirth #" + result.rebirths + " and gained a permanent " + result.multiplier.toLocaleString() + "× FC and XP multiplier.", {
      rebirths: result.rebirths, multiplier: result.multiplier, previousWealth: result.previousWealth
    });
    const nextTargets = [
      result.nextWalletRequired.toLocaleString() + " FC",
      "Level " + result.nextLevelRequired,
      result.nextQuestClaimsRequired + " quests",
      "Job level " + result.nextJobLevelRequired,
      result.nextWorkShiftsRequired + " shifts"
    ];
    if (result.nextGearItemsRequired > 0) {
      nextTargets.push(result.nextGearItemsRequired + " gear", result.nextCandyItemsRequired + " Candy items", result.nextCandyBalanceRequired + " Candy");
    }
    if (result.nextGearUpgradeLevelsRequired > 0) nextTargets.push(result.nextGearUpgradeLevelsRequired + " upgrade levels");
    return i.editReply(panel("REBIRTH COMPLETE", "Rebirth #" + result.rebirths + " · **" + result.multiplier.toLocaleString() + "× FC/XP**. New run: **2,500 FC · Level 1**.",
      [
        { name: "Next rebirth", value: nextTargets.join(" · ") },
        { name: "Kept", value: "Gear, upgrades, Candy, collectibles and lifetime stats." }
      ], [row(btn(owner, "profile", "Profile"), btn(owner, "gear", "Gear")), navButton(owner)], "success"));
  }
  if (action === "daily") {
    await i.deferUpdate();
    const r = await s.economy.daily(i.guildId, owner, memberRoleIds(i));
    const candyText = r.candyDrop ? " and found **" + r.candyDrop.amount + " Candy**" : "";
    await recordMemberAction(i, s, "daily_reward_claimed", "claimed a daily reward and earned " + r.amount.toLocaleString() + " FC" + candyText + ".", { amount: r.amount, xp: r.progression.gained, candy: r.candyDrop?.amount || 0 });
    return i.editReply(panel("DAILY REWARD CLAIMED", "You received **" + r.amount.toLocaleString() + " FC** and **" + r.progression.gained + " XP**." + (r.progression.levelsGained ? "\n🎉 You reached level " + r.progression.level + "!" : "") + (r.candyDrop ? "\n🍬 A Candy drop appeared! You found **" + r.candyDrop.amount + " Candy**." : ""),
      [{ name: "Current level", value: String(r.progression.level), inline: true }, ...(r.candyDrop ? [{ name: "Candy found", value: "+" + r.candyDrop.amount, inline: true }] : [])],
      [row(btn(owner, "earn", "Back to Earn")), navButton(owner)], "success"));
  }
  if (action === "work") {
    await i.deferUpdate();
    const shift = await s.jobs.startShift(i.guildId, owner);
    const challenge = makeWorkChallenge(shift.job, shift.jobLevel, 3);
    const session = { id: uuid().slice(0, 12), shift, challenge, index: 0, correct: 0, expiresAt: Date.now() + getWorkShiftTimeLimit(challenge.band) };
    sessions.set(session.id, session);
    return showWork(i, owner, session);
  }
  if (action === "work-answer") {
    await i.deferUpdate();
    const session = sessions.get(p[3]);
    const questionIndex = Number(p[4]);
    if (!session || session.expiresAt < Date.now() || session.index !== questionIndex) {
      sessions.delete(p[3]);
      return i.editReply(panel("SHIFT EXPIRED", "This challenge has ended. Start a new shift from Earn.", [], [row(btn(owner, "earn", "Back to Earn")), navButton(owner)], "warning"));
    }
    if (session.challenge.questions[session.index].answer === p[5]) session.correct += 1;
    session.index += 1;
    if (session.index < session.challenge.questions.length) return showWork(i, owner, session);
    sessions.delete(session.id);
    if (!session.correct) return i.editReply(panel("SHIFT TEST COMPLETE", "You answered 0/" + session.challenge.questions.length + " correctly. At least one correct answer is required to earn FC or XP. Your work cooldown still applies.", [], [row(btn(owner, "earn", "Back to Earn")), navButton(owner)], "warning"));
    const r = await s.jobs.completeShift(i.guildId, owner, session.shift.job.id, session.correct, session.challenge.questions.length, memberRoleIds(i));
    const candyText = r.candyDrop ? " and found **" + r.candyDrop.amount + " Candy**" : "";
    await recordMemberAction(i, s, "work_shift_completed", "completed a **" + r.job.name + "** work shift with " + session.correct + "/" + session.challenge.questions.length + " correct answers and earned " + r.pay.toLocaleString() + " FC" + candyText + ".", { careerId: r.job.id, correct: session.correct, total: session.challenge.questions.length, pay: r.pay, xp: r.progression.gained, candy: r.candyDrop?.amount || 0 });
    return i.editReply(panel("SHIFT COMPLETE", "You answered **" + session.correct + "/" + session.challenge.questions.length + "** correctly and earned **" + r.pay.toLocaleString() + " FC** plus **" + r.progression.gained + " XP**." + (r.candyDrop ? "\n🍬 You found **" + r.candyDrop.amount + " Candy**!" : ""),
      [{ name: "Career", value: r.job.name + " · Level " + r.jobLevel, inline: true }, { name: "Player level", value: String(r.progression.level), inline: true }, { name: "Level pay bonus", value: "+" + ((r.levelEarningMultiplier - 1) * 100).toFixed(1) + "%", inline: true }, { name: "Promotion", value: r.promoted ? "Job level increased!" : "Progress saved" }, ...(r.candyDrop ? [{ name: "Candy found", value: "+" + r.candyDrop.amount, inline: true }] : [])],
      [row(btn(owner, "profile", "View profile")), navButton(owner)], "success"));
  }
  if (action === "deposit" || action === "withdraw") return i.showModal(modal("dash:" + owner + ":bank-modal:" + action, action === "deposit" ? "Deposit into bank" : "Withdraw from bank", [{ id: "amount", label: "Amount in FC", placeholder: "1000", max: 12 }]));
  if (action.startsWith("casino-")) {
    const game = action.slice(7);
    return i.showModal(modal("dash:" + owner + ":casino-modal:" + game, "Place a casino wager", [{ id: "amount", label: "Wager in FC (minimum 100)", placeholder: String(balancing.casino.minBet), max: 16 }]));
  }
  if (action === "heist-join" || action === "heist-start" || action === "heist-status") {
    return i.showModal(modal("dash:" + owner + ":heist-modal:" + action, action === "heist-join" ? "Join a heist crew" : action === "heist-start" ? "Start your heist" : "Check a heist", [
      { id: "heist", label: "Heist ID", placeholder: "Paste the full crew ID", max: 36 }
    ]));
  }
  if (action === "weekly") return i.update(await renderMenu(i.guildId, owner, "weekly", s));
  if (action === "weekly-claim") {
    await i.deferUpdate();
    const r = await s.halloween.claimWeeklyActivity(i.guildId, owner, s.activity);
    const configured = await s.guildSettings.get(i.guildId, "halloweenRoleId");
    const reward = configured || r.roleId;
    let note = "";
    if (r.eligibleForRole && reward) {
      const assigned = await rewardRole(i, reward, "Completed the weekly Halloween activity mission");
      if (!assigned.assigned) note = "\n\n**Reward role not assigned:** " + assigned.issue;
    }
    await recordMemberAction(i, s, "halloween_weekly_claimed", "claimed the weekly activity reward after sending " + r.messages.toLocaleString() + " messages and received " + r.candy + " Candy.", { messages: r.messages, candy: r.candy, points: r.points });
    return i.editReply(panel("WEEKLY REWARD CLAIMED", "You reached " + r.messages.toLocaleString() + " messages and received **" + r.candy + " Candy** plus **" + r.points + " event points**." + note,
      [{ name: "Final reward progress", value: r.claimedCount + "/" + balancing.halloween.finalRoleQuestCount + " claims" }],
      [row(btn(owner, "event", "Back to Halloween")), navButton(owner)], "success"));
  }
  if (action === "event-refresh") return i.update(await renderMenu(i.guildId, owner, "event", s));
  if (action === "weekly-refresh") return i.update(await renderMenu(i.guildId, owner, "weekly", s));
}

async function handleModal(i, s) {
  const p = i.customId.split(":");
  const scope = p[0], owner = p[1], action = p[2], target = p[3];
  if (i.user.id !== owner) {
    await s.security.recordUnauthorizedControlAttempt(i, i.customId).catch(() => {});
    return i.reply({ content: "This form belongs to another member.", flags: MessageFlags.Ephemeral });
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  if (scope === "dash") {
    if (action === "leaderboard-search-modal") {
      const query = i.fields.getTextInputValue("query").trim();
      return i.editReply(await leaderboardPayload({ guild: i.guild, pool: s.pool, owner, metric: target, page: Number(p[4]) || 0, query }));
    }
    if (action === "trade-fc-modal") {
      const amount = numberField(i, "amount", 0, balancing.economy.maxWallet, "FC offer");
      const trade = await s.trades.get(i.guildId, target);
      if (!trade) throw new Error("This trade could not be found.");
      const side = trade.initiator_id === owner ? "initiator" : "target";
      const updated = await s.trades.setOffer(i.guildId, target, owner, { fc: amount, items: trade.offers[side].items });
      return i.editReply(await renderMenu(i.guildId, owner, "trade", s));
    }
    if (action === "trade-item-modal") {
      const quantity = numberField(i, "quantity", 1, 99, "Quantity");
      const itemId = p[4];
      const trade = await s.trades.get(i.guildId, target);
      if (!trade) throw new Error("This trade could not be found.");
      const side = trade.initiator_id === owner ? "initiator" : "target";
      const current = trade.offers[side].items.filter(x => x.itemId !== itemId);
      current.push({ itemId, quantity });
      await s.trades.setOffer(i.guildId, target, owner, { fc: trade.offers[side].fc, items: current });
      return i.editReply(await renderMenu(i.guildId, owner, "trade", s));
    }
    if (action === "bank-modal") {
      const amount = numberField(i, "amount", 1, 10000000, "Amount");
      await s.economy.transact(async (c) => {
        await s.economy.ensurePlayerTx(c, i.guildId, owner);
        const r = await c.query("SELECT wallet, bank FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [i.guildId, owner]);
        const player = r.rows[0];
        if (target === "deposit") {
          if (Number(player.wallet) < amount) throw new Error("Your wallet does not contain enough FC.");
          if (Number(player.bank) + amount > balancing.economy.maxWallet) throw new Error("That deposit would exceed the bank limit.");
          await s.economy.mutateTx(c, i.guildId, owner, -amount, "bank_deposit", uuid(), {});
          await c.query("UPDATE players SET bank = bank + $3, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, owner, amount]);
        } else {
          if (Number(player.bank) < amount) throw new Error("Your bank does not contain enough FC.");
          await c.query("UPDATE players SET bank = bank - $3, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, owner, amount]);
          await s.economy.mutateTx(c, i.guildId, owner, amount, "bank_withdrawal", uuid(), {});
        }
      });
      await recordMemberAction(i, s, target === "deposit" ? "bank_deposit" : "bank_withdrawal",
        (target === "deposit" ? "deposited " : "withdrew ") + amount.toLocaleString() + " FC " + (target === "deposit" ? "into the bank." : "from the bank."),
        { amount });
      return i.editReply(panel(target === "deposit" ? "DEPOSIT COMPLETE" : "WITHDRAWAL COMPLETE", amount.toLocaleString() + " FC was " + (target === "deposit" ? "moved into your bank." : "moved into your wallet."), [], [], "success"));
    }
    if (action === "casino-modal") {
      const amount = numberField(i, "amount", balancing.casino.minBet, null, "Wager");
      const r = await s.casino.play(i.guildId, owner, target, amount);
      const resultPayload = panel(r.game.name + "  /  " + (r.won ? "WIN" : "LOSS"), r.outcome, [
        { name: "Wager", value: r.wager.toLocaleString() + " FC", inline: true },
        { name: "Payout", value: r.payout.toLocaleString() + " FC", inline: true },
        { name: "Net result", value: (r.net > 0 ? "+" : "") + r.net.toLocaleString() + " FC", inline: true },
        ...(r.candyDrop ? [{ name: "🍬 Candy found", value: "+" + r.candyDrop.amount, inline: true }] : []),
        { name: "Fair-play rule", value: "Same published odds for everyone · " + r.cooldownMs / 1000 + "-second cooldown · " + Math.round(r.theoreticalReturnRate * 100) + "% long-run return" }
      ], [], r.won ? "success" : "warning", false);
      await recordMemberAction(i, s, "casino_round",
        "played **" + r.game.name + "** with a " + r.wager.toLocaleString() + " FC wager, received " +
        r.payout.toLocaleString() + " FC, and finished with a net result of " + (r.net > 0 ? "+" : "") +
        r.net.toLocaleString() + " FC" + (r.candyDrop ? " and found " + r.candyDrop.amount + " Candy" : "") + ".",
        { game: r.game.name, wager: r.wager, payout: r.payout, net: r.net },
        r.won ? "success" : "warning",
        resultPayload.embeds[0]);
      // The public result is posted by the activity publisher; this remains the private receipt.
      return i.editReply(resultPayload);
    }
    if (action === "heist-modal") {
      const id = i.fields.getTextInputValue("heist").trim();
      if (!/^[0-9a-f-]{20,36}$/i.test(id)) throw new Error("That does not look like a valid heist ID. Copy the full ID from the crew message.");
      if (target === "heist-join") {
        const opts = Object.entries(balancing.heistRoles).map(([key, v]) => ({ label: v.label, value: key, description: "Crew bonus +" + v.bonus }));
        return i.editReply(panel("CHOOSE YOUR CREW ROLE", "Choose the role you want to take in this heist.", [], [row(new StringSelectMenuBuilder().setCustomId("dash:" + owner + ":heist-join-role:" + id).setPlaceholder("Choose a crew role").setMinValues(1).setMaxValues(1).addOptions(opts))]));
      }
      if (target === "heist-start") {
        const r = await s.heists.start(i.guildId, owner, id, new Map([[owner, memberRoleIds(i)]]));
        const board = await refreshHeistBoard(i, s, id).catch((error) => {
          console.warn("[heists] Final crew board update failed:", error.code || error.message);
          return { posted: false, snapshot: null };
        });
        const snapshot = board.snapshot || await s.heists.status(i.guildId, id);
        await announceHeistResult(i, snapshot, r.crew);
        await safeAudit(i, s, "heist_completed", owner, {
          heistId: id, missionId: r.mission.id, succeeded: r.succeeded,
          totalPayout: r.totalPayout, successChance: r.successChance
        });
        await safeSendLog(i, s, "A heist mission finished with status " + (r.succeeded ? "success" : "failed") + ".");
        return i.editReply(panel(r.succeeded ? "HEIST SUCCESSFUL" : "HEIST FAILED",
          r.succeeded ? "Your crew completed **" + r.mission.name + "** and secured **" + r.totalPayout.toLocaleString() + " FC** in total. The result is now visible in the channel."
            : "Your crew's attempt at **" + r.mission.name + "** was unsuccessful. The final result is visible in the channel.",
          [
            { name: "Crew", value: getHeistCrewLines(snapshot.crew).join("\n").slice(0, 1000) },
            { name: "Success chance", value: r.successChance + "%", inline: true },
            { name: "Final roll", value: String(r.roll), inline: true },
            { name: "Team payout", value: r.totalPayout.toLocaleString() + " FC", inline: true },
            ...(board.posted ? [{ name: "Public result", value: "Posted in <#" + board.channel.id + ">." }] : [])
          ], [row(btn(owner, "heists", "Heist menu")), navButton(owner)], r.succeeded ? "success" : "warning"));
      }
      const r = await s.heists.status(i.guildId, id);
      return i.editReply({
        embeds: [buildHeistEmbed(r)],
        components: [row(btn(owner, "heists", "Heist menu")), navButton(owner)]
      });
    }
  }
  if (scope === "admin") {
    if (!await isAdmin(i, s)) throw new Error("This action is restricted to the server owner, bot owner, or configured Admin Role.");
    const reason = i.fields.getTextInputValue("reason")?.trim() || "";
    if (!reason) throw new Error("An audit reason is required.");
    if (["grant-fc", "grant-xp", "remove-fc"].includes(action)) {
      const amount = numberField(i, "amount", 1, 10000000, "Amount");
      if (action === "grant-xp") {
        const r = await s.economy.transact(async (c) => {
          await s.economy.ensurePlayerTx(c, i.guildId, target);
          const current = await c.query("SELECT level, xp FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [i.guildId, target]);
          let level = Number(current.rows[0].level), xp = Number(current.rows[0].xp) + amount, gained = 0;
          while (level < balancing.progression.maxLevel && xp >= levelXpRequired(level)) { xp -= levelXpRequired(level); level += 1; gained += 1; }
          if (level >= balancing.progression.maxLevel) xp = 0;
          await c.query("UPDATE players SET level = $3, xp = $4, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, target, level, xp]);
          return { level, gained };
        });
        await safeAudit(i, s, "admin_grant_xp", target, { amount, reason, newLevel: r.level, levelsGained: r.gained });
        await safeSendLog(i, s, "XP granted to <@" + target + "> by <@" + owner + ">: " + amount.toLocaleString() + ". Reason: " + reason);
        return i.editReply(panel("XP GRANTED", "Added **" + amount.toLocaleString() + " XP** to <@" + target + ">.\nCurrent level: **" + r.level + "**.", [{ name: "Audit reason", value: reason }], [], "success"));
      }
      const delta = action === "grant-fc" ? amount : -amount;
      await s.economy.transact((c) => s.economy.mutateTx(c, i.guildId, target, delta, action === "grant-fc" ? "admin_grant" : "admin_remove", uuid(), { actorId: owner, reason }));
      await safeAudit(i, s, action === "grant-fc" ? "admin_grant_coins" : "economy_remove", target, { amount: delta, reason });
      await safeSendLog(i, s, "FS Coins " + (delta > 0 ? "granted to " : "removed from ") + "<@" + target + "> by <@" + owner + ">: " + amount.toLocaleString() + ". Reason: " + reason);
      return i.editReply(panel(delta > 0 ? "FS COINS GRANTED" : "FS COINS REMOVED", (delta > 0 ? "Granted " : "Removed ") + "**" + amount.toLocaleString() + " FC** " + (delta > 0 ? "for " : "from ") + "<@" + target + ">.", [{ name: "Audit reason", value: reason }], [], "success"));
    }
    if (action === "set-level") {
      const level = numberField(i, "level", 1, balancing.progression.maxLevel, "Level");
      await s.economy.transact(async (c) => {
        await s.economy.ensurePlayerTx(c, i.guildId, target);
        await c.query("UPDATE players SET level = $3, xp = 0, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, target, level]);
      });
      await safeAudit(i, s, "admin_set_level", target, { level, reason });
      await safeSendLog(i, s, "Player level set to " + level + " for <@" + target + "> by <@" + owner + ">. Reason: " + reason);
      return i.editReply(panel("PLAYER LEVEL UPDATED", "Set <@" + target + ">'s player level to **" + level + "**. Current-level XP was reset to zero.", [{ name: "Audit reason", value: reason }], [], "success"));
    }
    if (action === "set-rebirth") {
      const rebirths = numberField(i, "rebirths", 0, balancing.progression.maxRebirths, "Rebirth count");
      await s.economy.transact(async (c) => {
        await s.economy.ensurePlayerTx(c, i.guildId, target);
        await c.query(
          "UPDATE players SET prestige = $3, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2",
          [i.guildId, target, rebirths]
        );
      });
      const multiplier = getRebirthMultiplier(rebirths);
      await safeAudit(i, s, "admin_set_rebirth", target, { rebirths, multiplier, reason });
      await safeSendLog(i, s, "Rebirth count set to " + rebirths + " (" + multiplier + "× FC/XP) for <@" + target + "> by <@" + owner + ">. Reason: " + reason);
      return i.editReply(panel("REBIRTH COUNT UPDATED", "Set <@" + target + ">'s rebirth count to **" + rebirths + "**. Their permanent earning multiplier is now **" + multiplier.toLocaleString() + "× FC/XP**. All other player progress was left unchanged.", [{ name: "Audit reason", value: reason }], [], "success"));
    }
    if (action === "career-modal") {
      const career = p[4];
      const job = balancing.jobs.find((x) => x.id === career);
      const level = numberField(i, "level", 1, 30, "Job level");
      if (!job) throw new Error("Choose a valid career.");
      await s.economy.transact(async (c) => {
        await s.economy.ensurePlayerTx(c, i.guildId, target);
        await c.query("UPDATE players SET job_id = $3, job_level = $4, job_xp = 0, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, target, career, level]);
      });
      await safeAudit(i, s, "admin_set_job", target, { career, jobLevel: level, reason });
      await safeSendLog(i, s, "Career assigned to <@" + target + "> by <@" + owner + ">: " + job.name + " level " + level + ". Reason: " + reason);
      return i.editReply(panel("CAREER ASSIGNED", "Assigned **" + job.name + " · Level " + level + "** to <@" + target + ">.", [{ name: "Audit reason", value: reason }], [], "success"));
    }
    if (action === "exclude-modal") {
      await s.economy.excludeFromLeaderboards(i.guildId, target, owner, reason);
      await safeAudit(i, s, "leaderboard_member_excluded", target, { reason });
      await safeSendLog(i, s, "Leaderboard exclusion by <@" + owner + "> for <@" + target + ">: " + reason);
      return i.editReply(panel("MEMBER EXCLUDED", "<@" + target + "> is now hidden from competitive leaderboards. Their wallet and progress are unchanged.", [{ name: "Reason", value: reason }], [], "success"));
    }
  }
  throw new Error("That form is not supported.");
}

async function handleDashboardInteraction(i, s) {
  if (i.isModalSubmit()) return handleModal(i, s);
  if (i.isButton()) return handleButton(i, s);
  if (i.isAnySelectMenu()) {
    const p = i.customId.split(":");
    if (i.user.id !== p[1]) {
      await s.security.recordUnauthorizedControlAttempt(i, i.customId).catch(() => {});
      return i.reply({ content: "This private dashboard belongs to another member.", flags: MessageFlags.Ephemeral });
    }
    return handleSelection(i, s, p[0], p[1], p[2], p);
  }
}
module.exports = { openMenu, openAdmin, handleDashboardInteraction, isAdmin, buildHeistEmbed, recordMemberAction, formatMemberActivityLog, renderMenu, renderAdmin };
