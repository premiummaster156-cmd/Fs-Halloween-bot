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
async function isAdmin(i, guildSettings) {
  if (isOwner(i) || i.memberPermissions?.has(PermissionFlagsBits.Administrator) || i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const configured = await guildSettings.get(i.guildId, "adminRoleId");
  const ids = memberRoleIds(i);
  return Boolean((configured && ids.includes(configured)) || settings.adminRoleIds.some((id) => ids.includes(id)));
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
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(label + " must be a whole number from " + min.toLocaleString() + " to " + max.toLocaleString() + ".");
  return value;
}
async function renderMenu(guildId, owner, page, s) {
  const nav = back(owner);
  if (page === "home") {
    const p = await getPlayer(s.pool, guildId, owner);
    const career = balancing.jobs.find((j) => j.id === p.job_id);
    const wealth = Number(p.wallet) + Number(p.bank);
    return panel("FUKISHOKAI  /  PLAYER HUB", "Welcome to your game centre. Pick a section below. Every screen explains the next step and shows the requirements before you commit.",
      [
        { name: "💎 Total wealth", value: wealth.toLocaleString() + " FC", inline: true },
        { name: "👛 Wallet", value: Number(p.wallet).toLocaleString() + " FC", inline: true },
        { name: "🏦 Bank", value: Number(p.bank).toLocaleString() + " FC", inline: true },
        { name: "⭐ Player level", value: "Level " + p.level + "\n" + bar(p.xp, levelXpRequired(Number(p.level)), 10), inline: false },
        { name: "💼 Career", value: career ? career.name + "  ·  Job level " + p.job_level : "Not selected — open Careers to choose one.", inline: true },
        { name: "🎯 Suggested next step", value: career ? "Claim Daily, complete a Work shift, upgrade your gear or join a crew." : "Start by choosing a career. You need one before you can work." }
      ],
      [
        row(btn(owner, "profile", "Profile", ButtonStyle.Primary, "👤"), btn(owner, "earn", "Earn", ButtonStyle.Success, "💰"), btn(owner, "career", "Careers", ButtonStyle.Secondary, "💼"), btn(owner, "gear", "Gear", ButtonStyle.Secondary, "🎒"), btn(owner, "games", "Games", ButtonStyle.Secondary, "🎮")),
        row(btn(owner, "heists", "Heists", ButtonStyle.Secondary, "🕵️"), btn(owner, "event", "Halloween", ButtonStyle.Secondary, "🎃"), btn(owner, "bank", "Bank", ButtonStyle.Secondary, "🏦"), btn(owner, "transfer", "Transfer", ButtonStyle.Secondary, "↗️"), btn(owner, "rankings", "Rankings", ButtonStyle.Secondary, "🏆")),
        row(btn(owner, "help", "How to play", ButtonStyle.Secondary, "📖"), btn(owner, "refresh", "Refresh", ButtonStyle.Secondary, "🔄"))
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
      { name: "⭐ Reputation", value: String(p.reputation), inline: true }
    ], [nav]);
  }
  if (page === "earn") {
    const p = await getPlayer(s.pool, guildId, owner);
    const career = balancing.jobs.find((j) => j.id === p.job_id);
    return panel("EARN  /  REWARDS", "Choose how to earn FC and XP. Work requires an active career; Daily can be claimed once per cooldown.",
      [
        { name: "🎁 Daily reward", value: "A quick FC and XP reward. Your player level increases the FC amount." },
        { name: "🧠 Work shift", value: career ? "Answer three questions based on your " + career.name + " role. Each correct answer adds to your pay and XP." : "No career selected. Open Careers first, then return here." },
        { name: "💬 Chat activity", value: "Eligible messages can earn FC and XP while daily caps remain." }
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
    const owned = inv.items.map((x) => (x.equipped ? "🟢 " : "▫️ ") + "**" + x.item.name + "** × " + x.quantity + (x.equipped ? " · Equipped" : ""));
    const equipped = inv.equipped.map((x) => "**" + x.slot + ":** " + x.item.name);
    const controls = [];
    const equip = inv.items.filter((x) => x.item.type === "equipment" && !x.equipped).map((x) => ({ label: x.item.name, value: x.item.id, description: "Equip in " + x.item.slot }));
    const unequip = inv.equipped.map((x) => ({ label: x.slot, value: x.slot, description: x.item.name }));
    if (equip.length) controls.push(menu(owner, "equip", "Choose gear to equip", equip));
    if (unequip.length) controls.push(menu(owner, "unequip", "Choose a slot to clear", unequip));
    controls.push(row(btn(owner, "shop", "Equipment shop", ButtonStyle.Primary, "🛒")));
    controls.push(nav);
    return panel("GEAR  /  INVENTORY", "Equipment adds bonuses to risky operations and work. You can equip one item in each slot.", [
      { name: "🎒 Owned items", value: owned.length ? owned.join("\n").slice(0, 1000) : "Your inventory is empty. Visit the shop to browse equipment." },
      { name: "🧩 Equipped gear", value: equipped.length ? equipped.join("\n") : "No equipment is currently active." },
      { name: "⚙️ Active bonuses", value: "Crime chance +" + effects.crimeChance + "% · Heist chance +" + effects.heistChance + "%\nWork pay +" + Math.round(effects.workPayBonus * 100) + "% · Fine reduction " + Math.round(effects.fineReduction * 100) + "%" }
    ], controls);
  }
  if (page === "shop") {
    const options = balancing.items.map((x) => ({ label: x.name, value: x.id, description: x.cost.toLocaleString() + " FC · Level " + x.minLevel + "+ · " + x.slot }));
    const list = balancing.items.map((x) => "**" + x.name + "** · " + x.cost.toLocaleString() + " FC\nLevel " + x.minLevel + "+ · " + x.slot + "\n" + x.description);
    return panel("EQUIPMENT SHOP", "Choose an item below to purchase it with FC. After buying, return to Gear to equip it.", [
      { name: "Available equipment", value: list.join("\n\n").slice(0, 3900) }
    ], [menu(owner, "shop-buy", "Select equipment to purchase", options), nav]);
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
    const usage = await s.casino.getDailyUsage(guildId, owner);
    const rows = games.map(([id, g]) => row(btn(owner, "casino-" + id, g.name, ButtonStyle.Secondary)));
    rows.push(nav);
    return panel("CASINO  /  FAIR PLAY TABLE",
      "Choose a game. Every member has the same betting limits and published odds. Results are random; no level or role gives anyone better casino odds.\n\n**Fair-play rules:** " +
      balancing.casino.cooldownMs / 1000 + "-second round cooldown · " +
      balancing.casino.maxBet.toLocaleString() + " FC maximum per round · " +
      balancing.casino.dailyWagerLimit.toLocaleString() + " FC total wagers per rolling 24 hours.",
      [
        { name: "Your remaining daily wagers", value: usage.remaining.toLocaleString() + " / " + usage.limit.toLocaleString() + " FC", inline: true },
        { name: "Long-run theoretical return", value: Math.round(balancing.casino.targetReturnRate * 100) + "% across a very large number of rounds. This is an average, not a promise for an individual session.", inline: false },
        ...games.map(([, g]) => ({ name: g.name + " · Level " + g.minLevel + "+", value: g.description }))
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
    if (!r.event) return panel("HALLOWEEN EVENT", "The seasonal event has not been configured by an administrator yet.", [
      { name: "Weekly activity", value: bar(weekly.messages, weekly.goal) + "\nYour eligible message count is tracked while the event is prepared." }
    ], [row(btn(owner, "weekly", "Weekly mission", ButtonStyle.Primary)), nav]);
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
      r.quests.map((q) => { const current = Math.min(q.goal, progress.get(q.id) || 0); const status = claims.has(q.id) ? " · CLAIMED" : current >= q.goal ? " · READY TO CLAIM" : ""; return { name: q.name + " · " + current + "/" + q.goal + status, value: q.description + " · Reward: " + q.candy + " Candy / " + q.points + " points" }; }), controls);
  }
  if (page === "weekly") {
    const w = await s.activity.getWeekly(guildId, owner);
    const ev = await s.halloween.getEvent(guildId);
    const active = ev && ev.enabled && new Date(ev.starts_at).getTime() <= Date.now() && new Date(ev.ends_at).getTime() > Date.now();
    const canClaim = w.messages >= w.goal && active;
    return panel("WEEKLY ACTIVITY MISSION", "Chat naturally in the server. One eligible message is counted per member per cooldown window.", [
      { name: "Your progress", value: bar(w.messages, w.goal) },
      { name: "Reward", value: balancing.halloween.weeklyMessageCandyReward + " Candy · " + balancing.halloween.weeklyMessagePointsReward + " event points", inline: true },
      { name: "Week begins", value: w.weekStart, inline: true },
      { name: "Claim status", value: canClaim ? "Ready to claim" : active ? "Keep chatting to reach the target" : "The event must be active to claim" }
    ], [...(canClaim ? [row(btn(owner, "weekly-claim", "Claim weekly reward", ButtonStyle.Success, "🎁"))] : []), nav]);
  }
  if (page === "event-shop") {
    const options = balancing.halloween.shop.map((x) => ({ label: x.name, value: x.id, description: x.cost + " Candy · " + x.description.slice(0, 70) }));
    return panel("HALLOWEEN COLLECTIBLES", "Choose a seasonal collectible to purchase with Candy. Purchased items are added to your inventory.",
      balancing.halloween.shop.map((x) => ({ name: x.name + " · " + x.cost + " Candy", value: x.description })),
      [menu(owner, "event-buy", "Choose a collectible", options), nav]);
  }
  if (page === "rankings") {
    return panel("FUKISHOKAI  /  LEADERBOARDS", "Choose the ranking you want to view.",
      [
        { name: "💰 Wealth", value: "Wallet plus bank balance." },
        { name: "⭐ Level", value: "Highest player level." },
        { name: "📈 Lifetime earned", value: "Total FC earned over time." },
        { name: "💬 Weekly activity", value: "Eligible messages counted this week." }
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
        { name: "3 · Save and upgrade", value: "Use your Bank for savings. Buy and equip items for activity bonuses." },
        { name: "4 · Take risks", value: "Crime and Casino can lose FC. Check the risk and possible fine first." },
        { name: "5 · Team up", value: "Create a Heist, share its ID, invite members, then start when your crew is ready." },
        { name: "6 · Halloween", value: "Complete quests, claim rewards, and follow the weekly activity mission." }
      ], [nav]);
  }
  return renderMenu(guildId, owner, "home", s);
}

async function renderAdmin(guildId, owner, page, s, targetId) {
  if (page === "home") {
    const cfg = await s.guildSettings.getAll(guildId);
    const ev = await s.halloween.getEvent(guildId);
    return panel("FUKISHOKAI  /  ADMIN CONSOLE", "One private control centre for the server. Select a category below. Player currency and progression edits remain owner-only.",
      [
        { name: "🛡️ Permission model", value: "Server admins: settings and event operations.\nServer owner / configured bot owner: player currency, XP, levels, careers and leaderboard eligibility." },
        { name: "⚙️ Server setup", value: "Admin role: " + (cfg.adminRoleId ? "<@&" + cfg.adminRoleId + ">" : "Not set") + "\nLog channel: " + (cfg.logChannelId ? "<#" + cfg.logChannelId + ">" : "Not set") },
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
      { name: "Additional admin role", value: cfg.adminRoleId ? "<@&" + cfg.adminRoleId + ">" : "Not set" },
      { name: "Admin log channel", value: cfg.logChannelId ? "<#" + cfg.logChannelId + ">" : "Not set" }
    ], [
      row(new RoleSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-reward").setPlaceholder("Set Halloween reward role").setMinValues(1).setMaxValues(1).setDefaultRoles(cfg.halloweenRoleId ? [cfg.halloweenRoleId] : [])),
      row(new RoleSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-xp").setPlaceholder("Set 2× XP role").setMinValues(1).setMaxValues(1).setDefaultRoles(cfg.xpBoosterRoleId ? [cfg.xpBoosterRoleId] : [])),
      row(new RoleSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-admin").setPlaceholder("Set additional admin role").setMinValues(1).setMaxValues(1).setDefaultRoles(cfg.adminRoleId ? [cfg.adminRoleId] : [])),
      row(new ChannelSelectMenuBuilder().setCustomId("admin:" + owner + ":setting-log").setPlaceholder("Set admin log channel").setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1).setDefaultChannels(cfg.logChannelId ? [cfg.logChannelId] : [])),
      row(aBtn(owner, "clear-settings", "Clear a setting", ButtonStyle.Danger, "🧹"), aBtn(owner, "home", "Admin console"))
    ]);
  }
  if (page === "clear-settings") {
    return panel("CLEAR SERVER SETTING", "Choose one setting to remove. This does not delete player data or rewards.", [],
      [row(new StringSelectMenuBuilder().setCustomId("admin:" + owner + ":clear-setting").setPlaceholder("Choose a setting to clear").setMinValues(1).setMaxValues(1).addOptions(
        { label: "Halloween reward role", value: "halloweenRoleId" },
        { label: "2× XP role", value: "xpBoosterRoleId" },
        { label: "Additional admin role", value: "adminRoleId" },
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
    if (!targetId) return panel("PLAYER MANAGEMENT", "Select a member to open their tools. Only the server owner or configured bot owner can make economy and progression changes.",
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
    if (!targetId) return panel("LEADERBOARD FAIRNESS", "Select a member to change their ranking eligibility. This tool is owner-only.",
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
  if (!await isAdmin(i, s.guildSettings)) return i.editReply(panel("ACCESS DENIED", "You need Administrator, Manage Server or the configured admin role to open this console.", [], [], "error"));
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
    if (!await isAdmin(i, s.guildSettings)) return i.reply({ content: "Your admin access has changed. Reopen the panel after checking permissions.", flags: MessageFlags.Ephemeral });
    if (action === "player-target") return i.update(await renderAdmin(i.guildId, owner, "player", s, value));
    if (action === "fairness-target") {
      if (!isOwner(i)) return i.reply({ content: "Only the server owner or configured bot owner can change leaderboard eligibility.", flags: MessageFlags.Ephemeral });
      return i.update(await renderAdmin(i.guildId, owner, "fairness", s, value));
    }
    if (action === "clear-setting") {
      const allowed = ["halloweenRoleId", "xpBoosterRoleId", "adminRoleId", "logChannelId"];
      if (!allowed.includes(value)) throw new Error("Unknown server setting.");
      await i.deferUpdate();
      await s.guildSettings.clear(i.guildId, value);
      await audit(s.pool, i.guildId, owner, "server_setting_cleared", null, { setting: value });
      await sendLog(i.client, i.guildId, value + " cleared by <@" + owner + ">.");
      return i.editReply(await renderAdmin(i.guildId, owner, "settings", s));
    }
    if (action.startsWith("setting-")) {
      await i.deferUpdate();
      const map = {
        "setting-reward": ["halloweenRoleId", "Halloween reward role"],
        "setting-xp": ["xpBoosterRoleId", "2x XP role"],
        "setting-admin": ["adminRoleId", "Additional admin role"],
        "setting-log": ["logChannelId", "Admin log channel"]
      };
      const setting = map[action];
      if (!setting) throw new Error("Unknown server setting.");
      if (setting[0] === "halloweenRoleId") {
        const role = await i.guild.roles.fetch(value);
        if (!role || role.id === i.guildId || role.managed) {
          return i.followUp({ content: "That role cannot be assigned by the bot. Choose a normal server role, not @everyone or an integration-managed role.", flags: MessageFlags.Ephemeral });
        }
      }
      await s.guildSettings.set(i.guildId, setting[0], value, owner);
      await audit(s.pool, i.guildId, owner, "server_setting_updated", null, { setting: setting[0], value });
      await sendLog(i.client, i.guildId, setting[1] + " updated by <@" + owner + ">.");
      return i.editReply(await renderAdmin(i.guildId, owner, "settings", s));
    }
    if (action === "career-select") {
      if (!isOwner(i)) return i.reply({ content: "Only the server owner or configured bot owner can assign careers.", flags: MessageFlags.Ephemeral });
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
    return i.editReply(panel("CAREER CONFIRMED", "You are now a **" + result.job.name + "**.\n" + result.job.description + "\n\nYour career is ready. Open Earn to start a shift.", [
      { name: "Starting pay", value: result.job.payMin.toLocaleString() + "–" + result.job.payMax.toLocaleString() + " FC", inline: true },
      { name: "Cooldown", value: Math.round(result.job.cooldownMs / 60000) + " minutes", inline: true }
    ], [row(btn(owner, "earn", "Go to Earn", ButtonStyle.Success)), navButton(owner)], "success"));
  }
  if (action === "transfer-target") {
    if (value === owner) return i.reply({ content: "You cannot transfer FC to yourself.", flags: MessageFlags.Ephemeral });
    return i.showModal(modal("dash:" + owner + ":transfer-modal:" + value, "Send FS Coins", [{ id: "amount", label: "Amount in FC", placeholder: "1000", max: 12 }]));
  }
  if (action === "equip" || action === "unequip" || action === "shop-buy" || action === "crime-run" || action === "event-claim" || action === "event-buy" || action === "ranking-type") {
    await i.deferUpdate();
    if (action === "equip") {
      const r = await s.inventory.equip(i.guildId, owner, value);
      return i.editReply(panel("EQUIPMENT UPDATED", "Equipped **" + r.item.name + "** in the **" + r.item.slot + "** slot." + (r.previousItem ? "\nReplaced: " + r.previousItem.name : ""), [], [row(btn(owner, "gear", "View gear")), navButton(owner)], "success"));
    }
    if (action === "unequip") {
      const r = await s.inventory.unequip(i.guildId, owner, value);
      return i.editReply(panel("GEAR UNEQUIPPED", "Removed **" + r.item.name + "** from your " + r.slot + " slot. The item remains in your inventory.", [], [row(btn(owner, "gear", "View gear")), navButton(owner)], "success"));
    }
    if (action === "shop-buy") {
      const r = await s.inventory.buy(i.guildId, owner, value);
      return i.editReply(panel("PURCHASE COMPLETE", "You purchased **" + r.item.name + "**.\n" + r.item.description, [{ name: "Wallet remaining", value: r.walletRemaining.toLocaleString() + " FC" }], [row(btn(owner, "gear", "View gear")), navButton(owner)], "success"));
    }
    if (action === "crime-run") {
      const r = await s.crime.attempt(i.guildId, owner, value, memberRoleIds(i));
      return i.editReply(panel(r.succeeded ? "OPERATION SUCCESSFUL" : "OPERATION FAILED",
        r.succeeded ? "You completed **" + r.crime.name + "** and earned **" + r.reward.toLocaleString() + " FC**." : "You were caught during **" + r.crime.name + "** and paid a fine of **" + r.fine.toLocaleString() + " FC**.",
        [{ name: "Success chance", value: r.successChance + "%", inline: true }, { name: r.succeeded ? "Reward" : "Fine", value: (r.succeeded ? r.reward : r.fine).toLocaleString() + " FC", inline: true }],
        [row(btn(owner, "crime", "Back to crime")), navButton(owner)], r.succeeded ? "success" : "warning"));
    }
    if (action === "event-claim") {
      const r = await s.halloween.claimQuest(i.guildId, owner, value);
      const configured = await s.guildSettings.get(i.guildId, "halloweenRoleId");
      const rewardRole = configured || r.roleId;
      let note = "";
      if (r.eligibleForRole && rewardRole) {
        const assigned = await rewardRole(i, rewardRole, "Completed the Halloween quest requirement");
        if (!assigned.assigned) note = "\n\n**Reward role not assigned:** " + assigned.issue;
      }
      await audit(s.pool, i.guildId, owner, "halloween_quest_claimed", owner, { questId: r.quest.id, candy: r.quest.candy, points: r.quest.points });
      return i.editReply(panel("QUEST CLAIMED", "**" + r.quest.name + "** completed. You received **" + r.quest.candy + " Candy** and **" + r.quest.points + " event points**." + note,
        [{ name: "Final role progress", value: r.claimedCount + "/" + balancing.halloween.finalRoleQuestCount + " claims" }],
        [row(btn(owner, "event", "Back to Halloween")), navButton(owner)], "success"));
    }
    if (action === "event-buy") {
      const r = await s.halloween.buyItem(i.guildId, owner, value);
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
    return i.editReply(panel("CREW CREATED  /  RECRUITING", "**" + r.mission.name + "** is ready for members to join. Share the ID below with your crew.", [
      { name: "HEIST ID", value: "||" + r.id + "||" },
      { name: "Crew size", value: r.mission.minParticipants + "–" + r.mission.maxParticipants + " members" }
    ], [row(new ButtonBuilder().setCustomId("dash:" + owner + ":copy:" + r.id).setLabel("Show copyable ID").setStyle(ButtonStyle.Primary)), row(btn(owner, "heists", "Heist menu")), navButton(owner)], "success"));
  }
  if (action === "heist-join-role") {
    await i.deferUpdate();
    const heistId = parts[3];
    const r = await s.heists.join(i.guildId, owner, heistId, value);
    return i.editReply(panel("YOU JOINED THE CREW", "You joined **" + r.mission.name + "** as **" + r.role.label + "**.", [
      { name: "Crew size", value: r.count + "/" + r.maximum }
    ], [row(btn(owner, "heists", "Heist menu")), navButton(owner)], "success"));
  }
}

function navButton(owner) { return row(btn(owner, "home", "Dashboard")); }

async function handleButton(i, s) {
  const p = i.customId.split(":");
  const scope = p[0], owner = p[1], action = p[2];
  if (i.user.id !== owner) return i.reply({ content: "This private dashboard belongs to another member. Run /menu or /admin panel to open your own.", flags: MessageFlags.Ephemeral });
  if (scope === "admin" && !await isAdmin(i, s.guildSettings)) return i.reply({ content: "You no longer have permission to use this control.", flags: MessageFlags.Ephemeral });
  if (scope === "admin") {
    const target = p[3];
    if (action === "fairness" && !isOwner(i)) {
      return i.reply({ content: "Only the server owner or configured bot owner can manage leaderboard eligibility.", flags: MessageFlags.Ephemeral });
    }
    if (action === "home" || action === "refresh" || action === "settings" || action === "clear-settings" || action === "event" || action === "player" || action === "fairness" || action === "logs" || action === "event-stop-confirm") {
      return i.update(await renderAdmin(i.guildId, owner, action === "refresh" ? "home" : action, s, target));
    }
    if (["grant-fc", "grant-xp", "remove-fc", "set-level"].includes(action)) {
      if (!isOwner(i)) return i.reply({ content: "Only the server owner or configured bot owner can edit member currency and progression.", flags: MessageFlags.Ephemeral });
      const isLevel = action === "set-level";
      return i.showModal(modal("admin:" + owner + ":" + action + ":" + target, isLevel ? "Set player level" : action === "remove-fc" ? "Remove FS Coins" : action === "grant-xp" ? "Grant XP" : "Grant FS Coins", [
        { id: isLevel ? "level" : "amount", label: isLevel ? "New level (1–100)" : "Amount", placeholder: isLevel ? "10" : "1000", max: 12 },
        { id: "reason", label: "Audit reason", paragraph: true, max: 500 }
      ]));
    }
    if (action === "set-career") {
      if (!isOwner(i)) return i.reply({ content: "Only the server owner or configured bot owner can assign careers.", flags: MessageFlags.Ephemeral });
      const opts = balancing.jobs.map((j) => ({ label: j.name, value: j.id, description: "Assign " + j.name }));
      const careerMenu = new StringSelectMenuBuilder().setCustomId("admin:" + owner + ":career-select:" + target).setPlaceholder("Choose a career").setMinValues(1).setMaxValues(1).addOptions(opts);
      return i.update(panel("ASSIGN CAREER", "Choose the career to assign to <@" + target + ">.", [], [row(careerMenu), row(aBtn(owner, "player", "Back to player tools", ButtonStyle.Secondary, null, target))]));
    }
    if (action === "exclude") {
      if (!isOwner(i)) return i.reply({ content: "Only the server owner or configured bot owner can change leaderboard eligibility.", flags: MessageFlags.Ephemeral });
      return i.showModal(modal("admin:" + owner + ":exclude-modal:" + target, "Exclude from leaderboards", [
        { id: "reason", label: "Reason for exclusion", paragraph: true, max: 500 }
      ]));
    }
    if (action === "include") {
      if (!isOwner(i)) return i.reply({ content: "Only the server owner or configured bot owner can change leaderboard eligibility.", flags: MessageFlags.Ephemeral });
      await i.deferUpdate();
      await s.economy.includeInLeaderboards(i.guildId, target);
      await audit(s.pool, i.guildId, owner, "leaderboard_member_included", target, {});
      await sendLog(i.client, i.guildId, "Leaderboard eligibility restored by <@" + owner + "> for <@" + target + ">.");
      return i.editReply(await renderAdmin(i.guildId, owner, "fairness", s, target));
    }
    if (action === "event-start" || action === "event-stop") {
      await i.deferUpdate();
      if (action === "event-start") {
        const roleId = await s.guildSettings.get(i.guildId, "halloweenRoleId");
        const result = await s.halloween.startEvent(i.guildId, owner, roleId);
        await audit(s.pool, i.guildId, owner, "halloween_event_started", null, { eventId: result.eventId, roleId: result.roleId, endsAt: result.endsAt });
        await sendLog(i.client, i.guildId, "Halloween event started by <@" + owner + ">.");
      } else {
        await s.halloween.stopEvent(i.guildId, owner);
        await audit(s.pool, i.guildId, owner, "halloween_event_stopped", null, {});
        await sendLog(i.client, i.guildId, "Halloween event stopped by <@" + owner + ">.");
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
  const pages = ["home", "profile", "earn", "career", "bank", "transfer", "gear", "shop", "games", "crime", "casino", "heists", "weekly", "event-shop", "rankings", "help"];
  if (pages.includes(action)) return i.update(await renderMenu(i.guildId, owner, action, s));
  if (action === "refresh") return i.update(await renderMenu(i.guildId, owner, "home", s));
  if (action === "daily") {
    await i.deferUpdate();
    const r = await s.economy.daily(i.guildId, owner, memberRoleIds(i));
    return i.editReply(panel("DAILY REWARD CLAIMED", "You received **" + r.amount.toLocaleString() + " FC** and **" + r.progression.gained + " XP**." + (r.progression.levelsGained ? "\n🎉 You reached level " + r.progression.level + "!" : ""),
      [{ name: "Current level", value: String(r.progression.level), inline: true }],
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
    return i.editReply(panel("SHIFT COMPLETE", "You answered **" + session.correct + "/3** correctly and earned **" + r.pay.toLocaleString() + " FC** plus **" + r.progression.gained + " XP**.",
      [{ name: "Career", value: r.job.name + " · Level " + r.jobLevel, inline: true }, { name: "Player level", value: String(r.progression.level), inline: true }, { name: "Promotion", value: r.promoted ? "Job level increased!" : "Progress saved" }],
      [row(btn(owner, "profile", "View profile")), navButton(owner)], "success"));
  }
  if (action === "deposit" || action === "withdraw") return i.showModal(modal("dash:" + owner + ":bank-modal:" + action, action === "deposit" ? "Deposit into bank" : "Withdraw from bank", [{ id: "amount", label: "Amount in FC", placeholder: "1000", max: 12 }]));
  if (action.startsWith("casino-")) {
    const game = action.slice(7);
    return i.showModal(modal("dash:" + owner + ":casino-modal:" + game, "Place a casino wager", [{ id: "amount", label: "Wager in FC (100–1,000)", placeholder: String(balancing.casino.minBet), max: 12 }]));
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
    await audit(s.pool, i.guildId, owner, "halloween_weekly_claimed", owner, { messages: r.messages, candy: r.candy });
    return i.editReply(panel("WEEKLY REWARD CLAIMED", "You reached " + r.messages.toLocaleString() + " eligible messages and received **" + r.candy + " Candy** plus **" + r.points + " event points**." + note,
      [{ name: "Final reward progress", value: r.claimedCount + "/" + balancing.halloween.finalRoleQuestCount + " claims" }],
      [row(btn(owner, "event", "Back to Halloween")), navButton(owner)], "success"));
  }
  if (action === "event-refresh") return i.update(await renderMenu(i.guildId, owner, "event", s));
}

async function handleModal(i, s) {
  const p = i.customId.split(":");
  const scope = p[0], owner = p[1], action = p[2], target = p[3];
  if (i.user.id !== owner) return i.reply({ content: "This form belongs to another member.", flags: MessageFlags.Ephemeral });
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
      return i.editReply(panel(target === "deposit" ? "DEPOSIT COMPLETE" : "WITHDRAWAL COMPLETE", amount.toLocaleString() + " FC was " + (target === "deposit" ? "moved into your bank." : "moved into your wallet."), [], [], "success"));
    }
    if (action === "transfer-modal") {
      const amount = numberField(i, "amount", balancing.economy.transferMinimum, balancing.economy.transferMaximum, "Transfer");
      await s.economy.transfer(i.guildId, owner, target, amount);
      await audit(s.pool, i.guildId, owner, "member_transfer", target, { amount });
      return i.editReply(panel("TRANSFER COMPLETE", "Sent **" + amount.toLocaleString() + " FC** to <@" + target + ">.", [], [], "success"));
    }
    if (action === "casino-modal") {
      const amount = numberField(i, "amount", balancing.casino.minBet, balancing.casino.maxBet, "Wager");
      const r = await s.casino.play(i.guildId, owner, target, amount);
      return i.editReply(panel(r.game.name + "  /  " + (r.won ? "WIN" : "LOSS"), r.outcome, [
        { name: "Wager", value: r.wager.toLocaleString() + " FC", inline: true },
        { name: "Payout", value: r.payout.toLocaleString() + " FC", inline: true },
        { name: "Net result", value: (r.net > 0 ? "+" : "") + r.net.toLocaleString() + " FC", inline: true },
        { name: "Daily wager budget left", value: r.dailyWagerRemaining.toLocaleString() + " / " + r.dailyWagerLimit.toLocaleString() + " FC", inline: true },
        { name: "Fair-play rule", value: "Same published odds for everyone · " + r.cooldownMs / 1000 + "-second cooldown" }
      ], [], r.won ? "success" : "warning"));
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
        return i.editReply(panel(r.succeeded ? "HEIST SUCCESSFUL" : "HEIST FAILED",
          r.succeeded ? "Your crew completed **" + r.mission.name + "** and secured **" + r.totalPayout.toLocaleString() + " FC**." : "The operation failed. The crew paid the mission penalty.",
          [{ name: "Success chance", value: r.successChance + "%", inline: true }, { name: "Roll", value: String(r.roll), inline: true }, { name: "Payout", value: r.totalPayout.toLocaleString() + " FC", inline: true }], [], r.succeeded ? "success" : "warning"));
      }
      const r = await s.heists.status(i.guildId, id);
      const mission = balancing.heists.find((m) => m.id === r.heist.mission_id);
      return i.editReply(panel("HEIST STATUS", "**" + (mission ? mission.name : r.heist.mission_id) + "**\nStatus: " + r.heist.status.toUpperCase() + " · Crew: " + r.heist.crew_count,
        [{ name: "Crew members", value: r.crew.map((x) => "<@" + x.user_id + "> · " + ((balancing.heistRoles[x.role_id] || {}).label || x.role_id)).join("\n").slice(0, 1000) }]));
    }
  }
  if (scope === "admin") {
    if (!await isAdmin(i, s.guildSettings) || !isOwner(i)) throw new Error("This action is restricted to the server owner or configured bot owner.");
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
        await audit(s.pool, i.guildId, owner, "admin_grant_xp", target, { amount, reason, newLevel: r.level, levelsGained: r.gained });
        await sendLog(i.client, i.guildId, "XP granted to <@" + target + "> by <@" + owner + ">: " + amount.toLocaleString() + ". Reason: " + reason);
        return i.editReply(panel("XP GRANTED", "Added **" + amount.toLocaleString() + " XP** to <@" + target + ">.\nCurrent level: **" + r.level + "**.", [{ name: "Audit reason", value: reason }], [], "success"));
      }
      const delta = action === "grant-fc" ? amount : -amount;
      await s.economy.transact((c) => s.economy.mutateTx(c, i.guildId, target, delta, action === "grant-fc" ? "admin_grant" : "admin_remove", uuid(), { actorId: owner, reason }));
      await audit(s.pool, i.guildId, owner, action === "grant-fc" ? "admin_grant_coins" : "economy_remove", target, { amount: delta, reason });
      await sendLog(i.client, i.guildId, "FS Coins " + (delta > 0 ? "granted to " : "removed from ") + "<@" + target + "> by <@" + owner + ">: " + amount.toLocaleString() + ". Reason: " + reason);
      return i.editReply(panel(delta > 0 ? "FS COINS GRANTED" : "FS COINS REMOVED", (delta > 0 ? "Granted " : "Removed ") + "**" + amount.toLocaleString() + " FC** " + (delta > 0 ? "for " : "from ") + "<@" + target + ">.", [{ name: "Audit reason", value: reason }], [], "success"));
    }
    if (action === "set-level") {
      const level = numberField(i, "level", 1, 100, "Level");
      await s.economy.transact(async (c) => {
        await s.economy.ensurePlayerTx(c, i.guildId, target);
        await c.query("UPDATE players SET level = $3, xp = 0, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [i.guildId, target, level]);
      });
      await audit(s.pool, i.guildId, owner, "admin_set_level", target, { level, reason });
      await sendLog(i.client, i.guildId, "Player level set to " + level + " for <@" + target + "> by <@" + owner + ">. Reason: " + reason);
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
      await audit(s.pool, i.guildId, owner, "admin_set_job", target, { career, jobLevel: level, reason });
      await sendLog(i.client, i.guildId, "Career assigned to <@" + target + "> by <@" + owner + ">: " + job.name + " level " + level + ". Reason: " + reason);
      return i.editReply(panel("CAREER ASSIGNED", "Assigned **" + job.name + " · Level " + level + "** to <@" + target + ">.", [{ name: "Audit reason", value: reason }], [], "success"));
    }
    if (action === "exclude-modal") {
      await s.economy.excludeFromLeaderboards(i.guildId, target, owner, reason);
      await audit(s.pool, i.guildId, owner, "leaderboard_member_excluded", target, { reason });
      await sendLog(i.client, i.guildId, "Leaderboard exclusion by <@" + owner + "> for <@" + target + ">: " + reason);
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
    if (i.user.id !== p[1]) return i.reply({ content: "This private dashboard belongs to another member.", flags: MessageFlags.Ephemeral });
    return handleSelection(i, s, p[0], p[1], p[2], p);
  }
}
module.exports = { openMenu, openAdmin, handleDashboardInteraction, isAdmin };
