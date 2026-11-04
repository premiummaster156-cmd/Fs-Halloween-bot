const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags, PermissionFlagsBits
} = require("discord.js");
const settings = require("../config/settings");
const balancing = require("../config/game-balancing");
const { createEmbed } = require("../ui");
const { getPlayer, getLeaderboard } = require("../services/economy");
const { getUpgradeCost } = require("../services/inventory");
const { levelXpRequired, uuid } = require("../utils/core");
const { makeWorkChallenge } = require("../games/work-challenge");
const { audit, sendLog } = require("../utils/logging");

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
function menu(owner, action, placeholder, options) {
  return row(new StringSelectMenuBuilder().setCustomId(["dash", owner, action].join(":")).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1).addOptions(options.slice(0, 25)));
}
async function safeAudit(i, services, action, targetId = null, details = {}) {
  if (await services.security.isAboveBotRole(i.guild, i.user.id)) return;
  return audit(services.pool, i.guildId, i.user.id, action, targetId, details);
}
async function safeSendLog(i, services, content) {
  if (await services.security.isAboveBotRole(i.guild, i.user.id)) return;
  return sendLog(i.client, i.guildId, content);
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
      await safeSendLog(i, services, "Member activity: " + action + " · " + displayName + " (" + actorId + ")" +
        (Object.keys(details).length ? " · " + JSON.stringify(details).slice(0, 700) : ""));
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
  for (const [key, label] of [
    ["workCooldownReduction", "Work cooldown"],
    ["crimeCooldownReduction", "Crime cooldown"],
    ["heistCooldownReduction", "Heist cooldown"],
    ["dailyCooldownReduction", "Daily cooldown"],
    ["casinoCooldownReduction", "Casino cooldown"]
  ]) if (effects[key]) lines.push(label + " -" + percent(effects[key]) + "%");
  return lines.length ? lines.join(" · ") : "No active bonuses";
}
function back(owner) { return row(btn(owner, "home", "Dashboard", ButtonStyle.Secondary, "⌂")); }
function modal(customId, title, fields) {
  const m = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const f of fields) {
    const input = new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setPlaceholder(f.placeholder || "")
      .setStyle(f.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(f.required !== false).setMaxLength(f.max || 100);
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
    const career = balancing.jobs.find((j) => j.id === p.job_id);
    const wealth = Number(p.wallet) + Number(p.bank);
    return panel("FUKISHOKAI  /  PLAYER HUB", "Welcome to your game centre. Pick a section below. Every screen explains the next step and shows the requirements before you commit.",
      [
        { name: "💎 Total wealth", value: wealth.toLocaleString() + " FC", inline: true },
        { name: "👛 Wallet", value: Number(p.wallet).toLocaleString() + " FC", inline: true },
        { name: "🏦 Bank", value: Number(p.bank).toLocaleString() + " FC", inline: true },
        { name: "🍬 Candy", value: Number(seasonal.wallet.candy || 0).toLocaleString(), inline: true },
        { name: "⭐ Player level", value: "Level " + p.level + "\n" + bar(p.xp, levelXpRequired(Number(p.level)), 10), inline: false },
        { name: "💼 Career", value: career ? career.name + "  ·  Job level " + p.job_level : "Not selected — open Careers to choose one.", inline: true },
        { name: "🎯 Suggested next step", value: career ? "Claim Daily, complete a Work shift, upgrade your gear or join a crew." : "Start by choosing a career. You need one before you can work." }
      ],
      [
        row(btn(owner, "profile", "Profile", ButtonStyle.Primary, "👤"), btn(owner, "earn", "Earn", ButtonStyle.Success, "💰"), btn(owner, "career", "Careers", ButtonStyle.Secondary, "💼"), btn(owner, "gear", "Gear", ButtonStyle.Secondary, "🎒"), btn(owner, "games", "Games", ButtonStyle.Secondary, "🎮")),
        row(btn(owner, "heists", "Heists", ButtonStyle.Secondary, "🕵️"), btn(owner, "event", "Halloween", ButtonStyle.Secondary, "🎃"), btn(owner, "bank", "Bank", ButtonStyle.Secondary, "🏦"), btn(owner, "transfer", "Transfer", ButtonStyle.Secondary, "↗️"), btn(owner, "rankings", "Rankings", ButtonStyle.Secondary, "🏆")),
        row(btn(owner, "rebirth", "Rebirth", ButtonStyle.Primary, "♻️"), btn(owner, "help", "How to play", ButtonStyle.Secondary, "📖"), btn(owner, "refresh", "Refresh", ButtonStyle.Secondary, "🔄"))
      ], "info", "FUKISHOKAI  •  Private player dashboard");
  }
  if (page === "profile") {
    const p = await getPlayer(s.pool, guildId, owner);
    const career = balancing.jobs.find((j) => j.id === p.job_id);
    return panel("PLAYER PROFILE", "Your current standing, wealth and activity across Fukishokai.", [
      { name: "⭐ Level " + p.level, value: bar(p.xp, levelXpRequired(Number(p.level))) + "\nXP to next level: " + Number(p.xp).toLocaleString() + "/" + levelXpRequired(Number(p.level)).toLocaleString() },
      { name: "💼 Career", value: career ? career.name + "  ·  Level " + p.job_level : "Unemployed", inline: true },
      { name: "💰 Wealth", value: (Number(p.wallet) + Number(p.bank)).toLocaleString() + " FC", inline: true },
      { name: "📈 Lifetime earned", value: Number(p.lifetime_earned).toLocaleString() + " FC", inline: true },
      { name: "🎭 Successful crimes", value: Number(p.crime_successes).toLocaleString(), inline: true },
      { name: "🕵️ Heists completed", value: Number(p.heists_completed).toLocaleString(), inline: true },
      { name: "⭐ Reputation", value: String(p.reputation), inline: true },
      { name: "♻️ Rebirths", value: Number(p.prestige || 0) + " · " + Math.pow(2, Math.min(Number(p.prestige || 0), 52)).toLocaleString() + "× FC / XP", inline: true }
    ], [nav]);
  }
  if (page === "earn") {
    const p = await getPlayer(s.pool, guildId, owner);
    const career = balancing.jobs.find((j) => j.id === p.job_id);
    return panel("EARN  /  REWARDS", "Choose how to earn FC and XP. Work requires an active career; Daily can be claimed once per cooldown.",
      [
        { name: "🎁 Daily reward", value: "A quick FC and XP reward. Your player level increases the FC amount." },
        { name: "🧠 Work shift", value: career ? "Answer three questions based on your " + career.name + " role. Each correct answer adds to your pay and XP." : "No career selected. Open Careers first, then return here." },
        { name: "💬 Chat activity", value: "Every message from a human member counts toward weekly activity, including rapid or spam messages. Chat FC and XP rewards still have daily caps." }
      ], [row(btn(owner, "daily", "Claim Daily", ButtonStyle.Success, "🎁"), btn(owner, "work", "Start Work Shift", ButtonStyle.Primary, "🧠")), nav]);
  }
  if (page === "career") {
    const data = await s.jobs.view(guildId, owner);
    const current = data.job ? data.job.name + " · Job level " + data.player.job_level : "Not selected";
    const options = data.jobs.map((j) => ({ label: j.name, value: j.id, description: "Level " + j.minLevel + "+ · Wallet " + j.minWallet.toLocaleString() + " FC" }));
    const lines = data.jobs.map((j) => "**" + j.tier + ". " + j.name + "** · Level " + j.minLevel + "+\nWallet " + j.minWallet.toLocaleString() + " FC · Pay " + j.payMin.toLocaleString() + "–" + j.payMax.toLocaleString() + " FC\n" + j.description);
    return panel("CAREER DESK", "Your career controls work pay and progression.\n\n**Current career:** " + current,
      [{ name: "Choose your path", value: lines.join("\n\n").slice(0, 3900) }],
      [menu(owner, "job-apply", "Choose a career to apply for", options), nav]);
  }
  if (page === "bank") {
    const b = await s.economy.getBalance(guildId, owner);
    return panel("BANK  /  FINANCES", "Move money between your wallet and bank. You can spend from your wallet; the bank keeps savings separate.", [
      { name: "👛 Wallet", value: b.wallet.toLocaleString() + " FC", inline: true },
      { name: "🏦 Bank", value: b.bank.toLocaleString() + " FC", inline: true },
      { name: "💎 Combined wealth", value: b.total.toLocaleString() + " FC", inline: true }
    ], [row(btn(owner, "deposit", "Deposit", ButtonStyle.Success, "⬆️"), btn(owner, "withdraw", "Withdraw", ButtonStyle.Primary, "⬇️")), nav]);
  }
  if (page === "transfer") {
    return panel("SEND FS COINS", "Choose a member to receive money. The next form asks for the amount. Transfers come from your wallet, not your bank.",
      [{ name: "Transfer limit", value: balancing.economy.transferMinimum.toLocaleString() + "–" + balancing.economy.transferMaximum.toLocaleString() + " FC per transfer." }],
      [row(new UserSelectMenuBuilder().setCustomId("dash:" + owner + ":transfer-target").setPlaceholder("Choose a server member").setMinValues(1).setMaxValues(1)), nav]);
  }
  if (page === "gear") {
    const inv = await s.inventory.getInventory(guildId, owner);
    const effects = await s.inventory.getEffects(guildId, owner);
    const owned = inv.items.map((x) => {
      if (x.item.type !== "equipment") {
        return "🎃 **" + x.item.name + "** × " + x.quantity + " · Candy collectible · Rebirth milestone";
      }
      const current = (x.equipped ? "🟢 " : "▫️ ") + "**" + x.item.name + "** × " + x.quantity +
        " · Upgrade " + x.upgradeLevel + "/" + balancing.itemUpgrades.maxLevel + (x.equipped ? " · Equipped" : "");
      if (x.upgradeLevel >= balancing.itemUpgrades.maxLevel) return current + " · MAX";
      const nextLevel = x.upgradeLevel + 1;
      const nextCost = getUpgradeCost(x.item, nextLevel);
      const requiredLevel = x.item.minLevel + nextLevel * balancing.itemUpgrades.levelRequirementPerUpgrade;
      return current + " · Next: " + nextCost.toLocaleString() + " FC / Lv " + requiredLevel;
    });
    const equipped = inv.equipped.map((x) => {
      const ownedItem = inv.items.find((entry) => entry.item.id === x.item.id);
      return "**" + x.slot + ":** " + x.item.name + " · Upgrade " + (ownedItem?.upgradeLevel || 0) + "/" + balancing.itemUpgrades.maxLevel;
    });
    const controls = [];
    const equip = inv.items.filter((x) => x.item.type === "equipment" && !x.equipped).map((x) => ({ label: x.item.name, value: x.item.id, description: "Equip in " + x.item.slot }));
    const unequip = inv.equipped.map((x) => ({ label: x.slot, value: x.slot, description: x.item.name }));
    const upgrade = inv.items.filter((x) => x.item.type === "equipment" && x.upgradeLevel < balancing.itemUpgrades.maxLevel)
      .map((x) => {
        const nextLevel = x.upgradeLevel + 1;
        const cost = getUpgradeCost(x.item, nextLevel);
        const requiredLevel = x.item.minLevel + nextLevel * balancing.itemUpgrades.levelRequirementPerUpgrade;
        return {
          label: x.item.name,
          value: x.item.id,
          description: "Level " + nextLevel + "/" + balancing.itemUpgrades.maxLevel + " · " + cost.toLocaleString() + " FC · Player level " + requiredLevel + "+" 
        };
      });
    if (equip.length) controls.push(menu(owner, "equip", "Choose gear to equip", equip));
    if (unequip.length) controls.push(menu(owner, "unequip", "Choose a slot to clear", unequip));
    if (upgrade.length) controls.push(menu(owner, "upgrade-item", "Choose gear to upgrade", upgrade));
    controls.push(row(btn(owner, "shop", "Equipment shop", ButtonStyle.Primary, "🛒")));
    controls.push(nav);
    return panel("GEAR  /  INVENTORY", "Equip one item per slot. Owned gear can be upgraded up to level " + balancing.itemUpgrades.maxLevel + "; each upgrade strengthens its bonuses.",
      [
        { name: "🎒 Owned items", value: owned.length ? owned.join("\n").slice(0, 1100) : "Your inventory is empty. Visit the shop to browse equipment." },
        { name: "🧩 Equipped gear", value: equipped.length ? equipped.join("\n") : "No equipment is currently active." },
        { name: "⚙️ Active bonuses", value: formatItemEffects(effects).slice(0, 1000) }
      ], controls);
  }
  if (page === "shop") {
    const options = balancing.items.map((x) => ({ label: x.name, value: x.id, description: x.cost.toLocaleString() + " FC · Level " + x.minLevel + "+ · " + x.slot }));
    const list = balancing.items.map((x) => "**" + x.name + "** · " + x.cost.toLocaleString() + " FC\nLevel " + x.minLevel + "+ · " + x.slot + "\n" + x.description + "\n*Bonuses:* " + formatItemEffects(x.effects));
    return panel("EQUIPMENT SHOP", "Higher-tier equipment costs more and requires a higher level. Buy it, equip it, then upgrade it from Gear.",
      [{ name: "Available equipment", value: list.join("\n\n").slice(0, 3900) }],
      [menu(owner, "shop-buy", "Select equipment to purchase", options), nav]);
  }
  if (page === "rebirth" || page === "rebirth-confirm") {
    const status = await s.economy.getRebirthStatus(guildId, owner);
    const checkRow = (passed, label, progress) => ({
      name: (passed ? "✅ " : "▫️ ") + label,
      value: progress,
      inline: false
    });
    const checks = [
      checkRow(status.checks.wealth, "Combined FC savings", status.wealth.toLocaleString() + "/" + status.walletRequired.toLocaleString() + " FC"),
      checkRow(status.checks.level, "Player level", "Level " + status.level + "/" + status.levelRequired),
      checkRow(status.checks.quests, "Event quest claims", status.questClaimsCount + "/" + status.questClaimsRequired + " normal quest rewards claimed"),
      checkRow(status.checks.career, "Active career", status.currentJob ? status.currentJob.name : "No career applied — choose one in Careers"),
      checkRow(status.checks.careerLevel, "Career level", (status.currentJob ? status.currentJob.name + " · " : "") + "Level " + status.currentJobLevel + "/" + status.jobLevelRequired),
      checkRow(status.checks.workShifts, "Work shifts this run", status.workShiftsCompleted + "/" + status.workShiftsRequired + " completed shifts")
    ];
    if (status.gearItemsRequired > 0) {
      checks.push(checkRow(status.checks.gearItems, "Different gear items owned", status.gearItemsCount + "/" + status.gearItemsRequired + " equipment pieces"));
      checks.push(checkRow(status.checks.candyItems, "Candy-shop collectibles owned", status.candyItemsCount + "/" + status.candyItemsRequired + " unique collectibles"));
      checks.push(checkRow(status.checks.candyBalance, "Unspent Candy reserve", status.candyBalance.toLocaleString() + "/" + status.candyBalanceRequired + " Candy"));
    }
    if (status.gearUpgradeLevelsRequired > 0) {
      checks.push(checkRow(status.checks.gearUpgrades, "Combined gear upgrade levels", status.gearUpgradeLevels + "/" + status.gearUpgradeLevelsRequired + " upgrade levels"));
    }
    if (page === "rebirth-confirm") {
      return panel("CONFIRM REBIRTH", "This is a permanent progression reset. Your next run receives a **" + status.nextMultiplier.toLocaleString() + "× FC and XP earning multiplier**.",
        [
          { name: "You will lose", value: "Wallet and bank balance (your new wallet will be 1,000 FC), player level and XP, current career and career level, and reputation." },
          { name: "You will keep", value: "Owned gear, gear upgrades, equipped items, lifetime statistics, event claims, Candy balance and Candy-shop collectibles." },
          ...checks,
          { name: "Eligibility", value: status.eligible ? "All requirements are complete. You can rebirth." : "Finish the requirements marked above before confirming." }
        ],
        [row(btn(owner, "rebirth-confirm", "Confirm permanent reset", ButtonStyle.Danger).setDisabled(!status.eligible), btn(owner, "rebirth", "Cancel", ButtonStyle.Secondary)), nav],
        "warning");
    }
    const requirementLines = [
      "• Combined savings: " + status.walletRequired.toLocaleString() + " FC",
      "• Player level: " + status.levelRequired,
      "• Claimed event quests: " + status.questClaimsRequired,
      "• Active career, job level " + status.jobLevelRequired + "+",
      "• Work shifts this run: " + status.workShiftsRequired
    ];
    if (status.gearItemsRequired > 0) {
      requirementLines.push(
        "• Different gear items: " + status.gearItemsRequired,
        "• Unique Candy-shop collectibles: " + status.candyItemsRequired,
        "• Unspent Candy reserve: " + status.candyBalanceRequired
      );
    }
    if (status.gearUpgradeLevelsRequired > 0) requirementLines.push("• Combined gear upgrade levels: " + status.gearUpgradeLevelsRequired);
    return panel("REBIRTH  /  PRESTIGE", "Each rebirth doubles your permanent FC and XP earning multiplier. Equipment and Candy milestones begin only after the first three rebirths.",
      [
        { name: "Current rebirths", value: String(status.rebirths), inline: true },
        { name: "Current multiplier", value: status.multiplier.toLocaleString() + "×", inline: true },
        { name: "Next multiplier", value: status.nextMultiplier.toLocaleString() + "×", inline: true },
        { name: "Next run requirements", value: requirementLines.join("\n") },
        { name: "Your progress", value: checks.map((x) => x.name + " — " + x.value).join("\n").slice(0, 1024) },
        { name: "Your Candy balance", value: status.candyBalance.toLocaleString() + " Candy · Drops come from earning FC, and equipped gear improves the chance." },
        { name: "After rebirth", value: "Wallet becomes 1,000 FC, bank becomes 0 and player level returns to 1. Your current career and reputation reset. Gear, upgrades, Candy, collectibles, lifetime records and claimed event rewards stay." },
        { name: "Progression curve", value: "FC target grows by 1.5× and player level by 2 per rebirth. Quest claims and work shifts rise gradually. Gear, Candy and upgrade requirements begin when preparing for rebirth four." }
      ],
      [row(btn(owner, "rebirth-review", "Review rebirth", ButtonStyle.Danger), btn(owner, "event-shop", "Candy shop", ButtonStyle.Secondary)), nav]);
  }
  if (page === "games") {
    return panel("OPERATIONS  /  GAME ROOM", "These activities involve risk. Read the possible costs and requirements before starting.",
      [
        { name: "🎭 Crime", value: "Attempt an operation for a possible reward. If caught, you pay a fine." },
        { name: "🎰 Casino", value: "Play Coin Flip, High Dice or Slots. You can lose the full wager." },
        { name: "🕵️ Heists", value: "Build a crew, pick roles and attempt a team mission." }
      ], [row(btn(owner, "crime", "Crime", ButtonStyle.Secondary, "🎭"), btn(owner, "casino", "Casino", ButtonStyle.Secondary, "🎰"), btn(owner, "heists", "Heists", ButtonStyle.Primary, "🕵️")), nav]);
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
    const rows = games.map(([id, g]) => row(btn(owner, "casino-" + id, g.name, ButtonStyle.Secondary)));
    rows.push(nav);
    return panel("CASINO  /  GAME TABLE",
      "Choose a game. Every player has the same published odds. The minimum bet is " +
      balancing.casino.minBet.toLocaleString() +
      " FC, with no maximum bet. There is a " + balancing.casino.cooldownMs / 1000 + "-second cooldown between rounds and no daily wager cap.",
      games.map(([, g]) => ({
        name: g.name + " · Level " + g.minLevel + "+",
        value: g.description + "\nTheoretical long-run return: " + Math.round(g.theoreticalReturnRate * 100) + "%"
      })),
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
        { name: "Candy drops", value: "Daily 12% · Work 20% · Crime 14% · Heists 26% · Casino payouts 6% · Chat FC rewards 2.5%. Equipped gear adds up to 20 percentage points; upgrades strengthen the bonus." }
      ], [row(btn(owner, "event-shop", "Candy shop", ButtonStyle.Primary), btn(owner, "weekly", "Weekly mission", ButtonStyle.Secondary)), nav]);
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
        { name: "Candy drop chances", value: "Daily 12% · Work 20% · Crime 14% · Heists 26% · Casino payouts 6% · Chat FC rewards 2.5%. Equipped gear adds up to 20 percentage points; upgrades improve the bonus." }
      ], controls);
  }
  if (page === "weekly") {
    const w = await s.activity.getWeekly(guildId, owner);
    const ev = await s.halloween.getEvent(guildId);
    const active = ev && ev.enabled && new Date(ev.starts_at).getTime() <= Date.now() && new Date(ev.ends_at).getTime() > Date.now();
    const canClaim = w.messages >= w.goal && active;
    return panel("WEEKLY ACTIVITY MISSION", "Every message from a human member counts toward your weekly total, including rapid or spam messages. Bot and webhook messages are ignored. Chat FC and XP rewards still have daily caps.", [
      { name: "Your progress", value: bar(w.messages, w.goal) },
      { name: "Reward", value: balancing.halloween.weeklyMessageCandyReward + " Candy · " + balancing.halloween.weeklyMessagePointsReward + " event points", inline: true },
      { name: "Week begins", value: w.weekStart, inline: true },
      { name: "Claim status", value: canClaim ? "Ready to claim" : active ? "Keep chatting to reach the target" : "The event must be active to claim" }
    ], [...(canClaim ? [row(btn(owner, "weekly-claim", "Claim weekly reward", ButtonStyle.Success, "🎁"))] : []), nav]);
  }
  if (page === "event-shop") {
    const status = await s.halloween.status(guildId, owner);
    const owned = await s.inventory.getInventory(guildId, owner);
    const ownedIds = new Set(owned.items.map((x) => x.item.id));
    const options = balancing.halloween.shop
      .filter((x) => !x.unique || !ownedIds.has(x.id))
      .map((x) => ({ label: x.name, value: x.id, description: x.cost + " Candy · " + x.description.slice(0, 65) }));
    return panel("HALLOWEEN  /  CANDY COLLECTIBLES",
      "Your balance: **" + Number(status.wallet.candy || 0).toLocaleString() + " Candy**. Collectibles are unique, stay in your inventory permanently and count toward later rebirth milestones. The shop stays open after the event schedule ends.",
      [
        ...balancing.halloween.shop.map((x) => ({
          name: x.name + " · " + x.cost + " Candy" + (ownedIds.has(x.id) ? " · OWNED" : ""),
          value: x.description
        })),
        { name: "How to find Candy", value: "Candy drops randomly when you earn FC. The chance depends on the activity, and equipped/upgraded gear can improve it. Drops remain available after the seasonal event dates." }
      ],
      [...(options.length ? [menu(owner, "event-buy", "Choose a collectible", options)] : []), nav]);
  }
  if (page === "rankings") {
    return panel("FUKISHOKAI  /  LEADERBOARDS", "Choose the ranking you want to view.",
      [
        { name: "💰 Wealth", value: "Wallet plus bank balance." },
        { name: "⭐ Level", value: "Highest player level." },
        { name: "📈 Lifetime earned", value: "Total FC earned over time." },
        { name: "💬 Weekly activity", value: "All human-member messages counted this week, with no count cooldown." }
      ], [menu(owner, "ranking-type", "Choose a ranking", [
        { label: "Wealth", value: "wealth" }, { label: "Level", value: "level" },
        { label: "Lifetime earned", value: "earned" }, { label: "Weekly activity", value: "activity" }
      ]), nav], "info");
  }
  if (page === "help") {
    return panel("HOW TO PLAY  /  QUICK GUIDE", "A simple route through the game. Open a dashboard section whenever you need more detail.",
      [
        { name: "1 · Start", value: "Choose a career. You need a career before you can work." },
        { name: "2 · Earn", value: "Claim Daily once per day and answer the three Work questions." },
        { name: "3 · Save and upgrade", value: "Use your Bank, buy gear, equip it and raise its upgrade level to strengthen its bonuses." },
        { name: "4 · Take risks", value: "Crime and Casino can lose FC. Check the risk and possible fine first." },
        { name: "5 · Team up", value: "Create a Heist, share its ID, invite members, then start when your crew is ready." },
        { name: "6 · Halloween", value: "Complete quests, claim rewards, and follow the weekly activity mission. A claimed event quest unlocks your first rebirth." },
        { name: "7 · Rebirth", value: "Build up your FC wealth and level, then reset your run for a permanent doubling of FC and XP earnings. Gear and upgrades stay with you." }
      ], [nav]);
  }
  return renderMenu(guildId, owner, "home", s);
}

async function renderAdmin(guildId, owner, page, s, targetId) {
  if (page === "home") {
    const cfg = await s.guildSettings.getAll(guildId);
    const ev = await s.halloween.getEvent(guildId);
    return panel("FUKISHOKAI  /  ADMIN CONSOLE", "One private control centre for the server. The server owner, bot owner and configured Admin Role can manage every control here.",
      [
        { name: "🔐 Bot access", value: "Server owner + OWNER_ID + the configured Admin Role. Discord Administrator alone does not grant bot control." },
        { name: "⚙️ Server setup", value: "Admin role: " + (cfg.adminRoleId ? "<@&" + cfg.adminRoleId + ">" : "Not configured") + "\nLog channel: " + (cfg.logChannelId ? "<#" + cfg.logChannelId + ">" : "Not set") + "\nHalloween reward role: " + (cfg.halloweenRoleId ? "<@&" + cfg.halloweenRoleId + ">" : "Not set") },
        { name: "🎃 Halloween", value: ev ? (ev.enabled ? "Enabled" : "Disabled") + " · Ends <t:" + Math.floor(new Date(ev.ends_at).getTime() / 1000) + ":R>" : "Not configured" }
      ], [
        row(aBtn(owner, "settings", "Server settings", ButtonStyle.Primary, "⚙️"), aBtn(owner, "event", "Event controls", ButtonStyle.Secondary, "🎃")),
        row(aBtn(owner, "player", "Player management", ButtonStyle.Secondary, "👤"), aBtn(owner, "fairness", "Leaderboard fairness", ButtonStyle.Secondary, "🏆")),
        row(aBtn(owner, "logs", "Audit history", ButtonStyle.Secondary, "📋"), aBtn(owner, "refresh", "Refresh", ButtonStyle.Secondary, "🔄"))
      ], "info", "FUKISHOKAI  •  Private administrator console");
  }
  if (page === "settings") {
    const cfg = await s.guildSettings.getAll(guildId);
    return panel("SERVER SETTINGS", "Select an item below to configure it. Changes are saved immediately and written to the audit history.", [
      { name: "Halloween reward role", value: cfg.halloweenRoleId ? "<@&" + cfg.halloweenRoleId + ">" : "Not set" },
      { name: "2× XP role", value: cfg.xpBoosterRoleId ? "<@&" + cfg.xpBoosterRoleId + ">" : "Not set" },
      { name: "Admin role", value: cfg.adminRoleId ? "<@&" + cfg.adminRoleId + ">" : "Not configured" },
      { name: "Admin log channel", value: cfg.logChannelId ? "<#" + cfg.logChannelId + ">" : "Not set" }
    ], [
      row(new RoleSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-admin").setPlaceholder("Set trusted Admin Role").setMinValues(1).setMaxValues(1).setDefaultRoles(cfg.adminRoleId ? [cfg.adminRoleId] : [])),
      row(new RoleSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-reward").setPlaceholder("Set Halloween reward role").setMinValues(1).setMaxValues(1).setDefaultRoles(cfg.halloweenRoleId ? [cfg.halloweenRoleId] : [])),
      row(new RoleSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-xp").setPlaceholder("Set 2× XP role").setMinValues(1).setMaxValues(1).setDefaultRoles(cfg.xpBoosterRoleId ? [cfg.xpBoosterRoleId] : [])),
      row(new ChannelSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-log").setPlaceholder("Set admin log channel").setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1).setDefaultChannels(cfg.logChannelId ? [cfg.logChannelId] : [])),
      row(aBtn(owner, "clear-settings", "Clear a setting", ButtonStyle.Danger, "🧹"), aBtn(owner, "home", "Admin console"))
    ]);
  }
  if (page === "clear-settings") {
    return panel("CLEAR SERVER SETTING", "Choose one setting to remove. This does not delete player data or rewards.", [],
      [row(new StringSelectMenuBuilder().setCustomId("admin:" + owner + ":clear-setting").setPlaceholder("Choose a setting to clear").setMinValues(1).setMaxValues(1).addOptions(
        { label: "Halloween reward role", value: "halloweenRoleId" },
        { label: "2× XP role", value: "xpBoosterRoleId" },
        { label: "Admin role", value: "adminRoleId" },
        { label: "Admin log channel", value: "logChannelId" }
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
        { name: "Career", value: job ? job.name + " · Level " + p.job_level : "Unemployed", inline: true }
      ], [
        row(aBtn(owner, "grant-fc", "Grant FC", ButtonStyle.Success, "➕", targetId), aBtn(owner, "grant-xp", "Grant XP", ButtonStyle.Success, "⭐", targetId), aBtn(owner, "remove-fc", "Remove FC", ButtonStyle.Danger, "➖", targetId)),
        row(aBtn(owner, "set-level", "Set level", ButtonStyle.Secondary, "🎚️", targetId), aBtn(owner, "set-career", "Assign career", ButtonStyle.Secondary, "💼", targetId)),
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
  const buttons = q.options.map((x) => new ButtonBuilder()
    .setCustomId("dash:" + owner + ":work-answer:" + session.id + ":" + session.index + ":" + x.letter)
    .setLabel(x.letter + " · " + x.value).setStyle(ButtonStyle.Secondary));
  const embed = createEmbed({
    title: "WORK SHIFT  /  QUESTION " + (session.index + 1) + " OF 3",
    description: q.question + "\n\nChoose the correct answer below. This screen expires after 60 seconds.",
    color: settings.brand.primary, icon: "task",
    fields: [
      { name: "Career", value: session.shift.job.name + " · Level " + session.shift.jobLevel, inline: true },
      { name: "Correct so far", value: session.correct + "/" + session.index, inline: true },
      { name: "Difficulty", value: session.challenge.band.toUpperCase(), inline: true },
      { name: "Shift progress", value: bar(session.index, 3) }
    ],
    footer: "FUKISHOKAI  •  Answer all three questions to maximise your reward"
  });
  return i.editReply({ embeds: [embed], components: [row(...buttons)] });
}

async function handleSelection(i, s, scope, owner, action, parts) {
  const value = i.values[0];
  if (scope === "admin") {
    if (!await isAdmin(i, s)) return i.reply({ content: "Your admin access has changed. Reopen the panel after checking permissions.", flags: MessageFlags.Ephemeral });
    if (action === "player-target") return i.update(await renderAdmin(i.guildId, owner, "player", s, value));
    if (action === "fairness-target") {
      if (!await isAdmin(i, s)) return i.reply({ content: "Only the server owner, bot owner, or configured Admin Role can change leaderboard eligibility.", flags: MessageFlags.Ephemeral });
      return i.update(await renderAdmin(i.guildId, owner, "fairness", s, value));
    }
    if (action === "clear-setting") {
      const allowed = ["halloweenRoleId", "xpBoosterRoleId", "adminRoleId", "logChannelId"];
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
        "setting-log": ["logChannelId", "Admin log channel"]
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
  if (action === "transfer-target") {
    if (value === owner) return i.reply({ content: "You cannot transfer FC to yourself.", flags: MessageFlags.Ephemeral });
    return i.showModal(modal("dash:" + owner + ":transfer-modal:" + value, "Send FS Coins", [{ id: "amount", label: "Amount in FC", placeholder: "1000", max: 12 }]));
  }
  if (action === "equip" || action === "unequip" || action === "shop-buy" || action === "upgrade-item" || action === "crime-run" || action === "event-claim" || action === "event-buy" || action === "ranking-type") {
    await i.deferUpdate();
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
      let lines;
      let title;
      if (value === "activity") {
        const r = await s.activity.leaderboard(i.guildId, 10);
        title = "WEEKLY ACTIVITY RANKING";
        lines = r.rows.map((x, n) => "**" + (n + 1) + ".** <@" + x.user_id + "> · " + Number(x.messages).toLocaleString() + " messages");
        return i.editReply(panel(title, "Week starting " + r.weekStart + "\n\n" + (lines.length ? lines.join("\n") : "No eligible activity has been recorded this week."), [], [row(btn(owner, "rankings", "Change ranking")), navButton(owner)]));
      }
      const r = await getLeaderboard(s.pool, i.guildId, value, 10);
      title = "FUKISHOKAI  /  " + value.toUpperCase() + " RANKING";
      lines = r.map((x, n) => "**" + (n + 1) + ".** <@" + x.user_id + "> · " + (value === "level" ? "Level " + x.score : Number(x.score).toLocaleString() + (value === "wealth" ? " FC" : " FC earned")));
      return i.editReply(panel(title, lines.length ? lines.join("\n") : "No ranked players yet.", [], [row(btn(owner, "rankings", "Change ranking")), navButton(owner)]));
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
    if (action === "home" || action === "refresh" || action === "settings" || action === "clear-settings" || action === "event" || action === "player" || action === "fairness" || action === "logs" || action === "event-stop-confirm") {
      return i.update(await renderAdmin(i.guildId, owner, action === "refresh" ? "home" : action, s, target));
    }
    if (["grant-fc", "grant-xp", "remove-fc", "set-level"].includes(action)) {
      if (!await isAdmin(i, s)) return i.reply({ content: "Only the server owner, bot owner, or configured Admin Role can edit member currency and progression.", flags: MessageFlags.Ephemeral });
      const isLevel = action === "set-level";
      return i.showModal(modal("admin:" + owner + ":" + action + ":" + target, isLevel ? "Set player level" : action === "remove-fc" ? "Remove FS Coins" : action === "grant-xp" ? "Grant XP" : "Grant FS Coins", [
        { id: isLevel ? "level" : "amount", label: isLevel ? "New level (1–100)" : "Amount", placeholder: isLevel ? "10" : "1000", max: 12 },
        { id: "reason", label: "Audit reason", paragraph: true, max: 500 }
      ]));
    }
    if (action === "set-career") {
      if (!await isAdmin(i, s)) return i.reply({ content: "Only the server owner, bot owner, or configured Admin Role can assign careers.", flags: MessageFlags.Ephemeral });
      const opts = balancing.jobs.map((j) => ({ label: j.name, value: j.id, description: "Assign " + j.name }));
      const careerMenu = new StringSelectMenuBuilder().setCustomId("admin:" + owner + ":career-select:" + target).setPlaceholder("Choose a career").setMinValues(1).setMaxValues(1).addOptions(opts);
      return i.update(panel("ASSIGN CAREER", "Choose the career to assign to <@" + target + ">.", [], [row(careerMenu), row(aBtn(owner, "player", "Back to player tools", ButtonStyle.Secondary, null, target))]));
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
  const pages = ["home", "profile", "earn", "career", "bank", "transfer", "gear", "shop", "games", "crime", "casino", "heists", "weekly", "event-shop", "rankings", "rebirth", "help"];
  if (pages.includes(action)) return i.update(await renderMenu(i.guildId, owner, action, s));
  if (action === "refresh") return i.update(await renderMenu(i.guildId, owner, "home", s));
  if (action === "rebirth-review") return i.update(await renderMenu(i.guildId, owner, "rebirth-confirm", s));
  if (action === "rebirth-confirm") {
    await i.deferUpdate();
    const result = await s.economy.rebirth(i.guildId, owner);
    await recordMemberAction(i, s, "player_rebirth", "completed Rebirth #" + result.rebirths + " and gained a permanent " + result.multiplier.toLocaleString() + "× FC and XP multiplier.", {
      rebirths: result.rebirths, multiplier: result.multiplier, previousWealth: result.previousWealth
    });
    return i.editReply(panel("REBIRTH COMPLETE", "Your new run has started. You now have **1,000 FC**, **level 1**, and a permanent **" + result.multiplier.toLocaleString() + "× FC and XP earning multiplier**.",
      [
        { name: "Rebirth count", value: String(result.rebirths), inline: true },
        { name: "Next wealth requirement", value: result.nextWalletRequired.toLocaleString() + " FC", inline: true },
        { name: "Next level requirement", value: "Level " + result.nextLevelRequired, inline: true },
        { name: "Next career requirement", value: "Apply for a job and reach job level " + result.nextJobLevelRequired, inline: true },
        { name: "Next event quest requirement", value: result.nextQuestClaimsRequired + " normal event quest rewards claimed", inline: true },
        { name: "Next work requirement", value: result.nextWorkShiftsRequired + " completed shifts in the next run", inline: true },
        ...(result.nextGearItemsRequired > 0 ? [{ name: "Next gear requirement", value: result.nextGearItemsRequired + " different equipment items", inline: true }] : []),
        ...(result.nextCandyItemsRequired > 0 ? [{ name: "Next Candy collectible requirement", value: result.nextCandyItemsRequired + " unique Candy-shop items", inline: true }] : []),
        ...(result.nextCandyBalanceRequired > 0 ? [{ name: "Next Candy reserve", value: result.nextCandyBalanceRequired + " unspent Candy", inline: true }] : []),
        ...(result.nextGearUpgradeLevelsRequired > 0 ? [{ name: "Next gear upgrade requirement", value: result.nextGearUpgradeLevelsRequired + " combined upgrade levels", inline: true }] : []),
        { name: "Gear and upgrades", value: "Your inventory, equipped items, upgrade levels, Candy and Candy-shop collectibles were preserved." }
      ], [row(btn(owner, "profile", "View profile"), btn(owner, "gear", "View gear")), navButton(owner)], "success"));
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
    const session = { id: uuid().slice(0, 12), shift, challenge, index: 0, correct: 0, expiresAt: Date.now() + 180000 };
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
    if (!session.correct) return i.editReply(panel("SHIFT TEST COMPLETE", "You answered 0/3 correctly. At least one correct answer is required to earn FC or XP. Your work cooldown still applies.", [], [row(btn(owner, "earn", "Back to Earn")), navButton(owner)], "warning"));
    const r = await s.jobs.completeShift(i.guildId, owner, session.shift.job.id, session.correct, 3, memberRoleIds(i));
    const candyText = r.candyDrop ? " and found **" + r.candyDrop.amount + " Candy**" : "";
    await recordMemberAction(i, s, "work_shift_completed", "completed a **" + r.job.name + "** work shift with " + session.correct + "/3 correct answers and earned " + r.pay.toLocaleString() + " FC" + candyText + ".", { careerId: r.job.id, correct: session.correct, total: 3, pay: r.pay, xp: r.progression.gained, candy: r.candyDrop?.amount || 0 });
    return i.editReply(panel("SHIFT COMPLETE", "You answered **" + session.correct + "/3** correctly and earned **" + r.pay.toLocaleString() + " FC** plus **" + r.progression.gained + " XP**." + (r.candyDrop ? "\n🍬 You found **" + r.candyDrop.amount + " Candy**!" : ""),
      [{ name: "Career", value: r.job.name + " · Level " + r.jobLevel, inline: true }, { name: "Player level", value: String(r.progression.level), inline: true }, { name: "Promotion", value: r.promoted ? "Job level increased!" : "Progress saved" }, ...(r.candyDrop ? [{ name: "Candy found", value: "+" + r.candyDrop.amount, inline: true }] : [])],
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
    if (action === "transfer-modal") {
      const amount = numberField(i, "amount", balancing.economy.transferMinimum, balancing.economy.transferMaximum, "Transfer");
      await s.economy.transfer(i.guildId, owner, target, amount);
      await recordMemberAction(i, s, "member_transfer", "sent " + amount.toLocaleString() + " FC to <@" + target + ">.", { amount, recipientId: target });
      return i.editReply(panel("TRANSFER COMPLETE", "Sent **" + amount.toLocaleString() + " FC** to <@" + target + ">.", [], [], "success"));
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
          while (level < 100 && xp >= levelXpRequired(level)) { xp -= levelXpRequired(level); level += 1; gained += 1; }
          if (level >= 100) xp = 0;
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
      const level = numberField(i, "level", 1, 100, "Level");
      await s.economy.transact(async (c) => {
        await s.economy.ensurePlayerTx(c, i.guildId, target);
        await c.query("UPDATE players SET level = $3, xp = 0, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, target, level]);
      });
      await safeAudit(i, s, "admin_set_level", target, { level, reason });
      await safeSendLog(i, s, "Player level set to " + level + " for <@" + target + "> by <@" + owner + ">. Reason: " + reason);
      return i.editReply(panel("PLAYER LEVEL UPDATED", "Set <@" + target + ">'s player level to **" + level + "**. Current-level XP was reset to zero.", [{ name: "Audit reason", value: reason }], [], "success"));
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
module.exports = { openMenu, openAdmin, handleDashboardInteraction, isAdmin, buildHeistEmbed, recordMemberAction };
