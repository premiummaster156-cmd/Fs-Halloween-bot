const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { randomUUID } = require("node:crypto");
const { createEmbed } = require("../ui");
const balancing = require("../config/game-balancing");
const { getPlayer, getLeaderboard } = require("../services/economy");
const { makeWorkChallenge } = require("../games/work-challenge");
const { getRebirthMultiplier, levelXpRequired } = require("../utils/core");

function embed(title, description, fields = [], color = 0x851E2A) {
  return {
    embeds: [createEmbed({
      title,
      description,
      fields,
      color,
      footer: "FUKISHOKAI  •  Game Centre",
      icon: "profile"
    })],
    allowedMentions: { parse: [] }
  };
}

function memberRoleIds(interaction) {
  const roles = interaction.member?.roles;
  return roles?.cache ? Array.from(roles.cache.keys()) : Array.isArray(roles) ? roles : [];
}

function bar(value, maximum, width = 14) {
  const max = Math.max(1, Number(maximum) || 1);
  const current = Math.max(0, Math.min(max, Number(value) || 0));
  const filled = Math.round((current / max) * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

const dailyCommand = {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily FS Coins and XP reward."),
  async execute(interaction, services) {
    const result = await services.economy.daily(interaction.guildId, interaction.user.id, memberRoleIds(interaction));
    const fields = [
      { name: "FS Coins", value: "+" + result.amount.toLocaleString() + " FC", inline: true },
      { name: "XP earned", value: "+" + result.progression.gained + " XP", inline: true },
      { name: "Player level", value: String(result.progression.level), inline: true }
    ];
    if (result.candyDrop) fields.push({ name: "Candy found", value: "+" + result.candyDrop.amount, inline: true });
    return interaction.editReply(embed(
      "🎁 DAILY REWARD",
      "Your daily reward has been claimed. Come back when the 24-hour timer is ready; there is no streak to lose.",
      fields,
      0x32865B
    ));
  }
};

const profileCommand = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your profile or another member's public game stats.")
    .addUserOption((option) => option
      .setName("member")
      .setDescription("Whose profile should be shown?")
      .setRequired(false)),
  async execute(interaction, services) {
    const member = interaction.options.getUser("member") || interaction.user;
    const player = await getPlayer(services.pool, interaction.guildId, member.id);
    const career = balancing.jobs.find((job) => job.id === player.job_id);
    const wealth = Number(player.wallet) + Number(player.bank);
    const stats = await services.partyGames.getStats(interaction.guildId, member.id);
    return interaction.editReply(embed(
      "👤 " + (member.globalName || member.username) + "  /  PLAYER PROFILE",
      "A snapshot of this member's Fukishokai progress.",
      [
        { name: "Level", value: "Level " + player.level + "\n" + bar(player.xp, levelXpRequired(Number(player.level))) + "\n" + Number(player.xp).toLocaleString() + "/" + levelXpRequired(Number(player.level)) + " XP", inline: false },
        { name: "Total wealth", value: wealth.toLocaleString() + " FC", inline: true },
        { name: "Wallet", value: Number(player.wallet).toLocaleString() + " FC", inline: true },
        { name: "Bank", value: Number(player.bank).toLocaleString() + " FC", inline: true },
        { name: "Career", value: career ? career.name + " · Job level " + player.job_level : "Not selected", inline: true },
        { name: "Rebirths", value: Number(player.prestige) + " · " + getRebirthMultiplier(player.prestige).toLocaleString() + "× earnings", inline: true },
        { name: "Lifetime earned", value: Number(player.lifetime_earned).toLocaleString() + " FC", inline: true },
        { name: "Party record", value: Number(stats.wins).toLocaleString() + " wins in " + Number(stats.games).toLocaleString() + " games · " + Number(stats.points).toLocaleString() + " points", inline: false }
      ]
    ));
  }
};

const jobCommand = {
  data: new SlashCommandBuilder()
    .setName("job")
    .setDescription("Browse careers or apply for one.")
    .addSubcommand((subcommand) => subcommand
      .setName("careers")
      .setDescription("Show careers, pay ranges and level requirements."))
    .addSubcommand((subcommand) => subcommand
      .setName("apply")
      .setDescription("Apply for a career you qualify for.")
      .addStringOption((option) => option
        .setName("career")
        .setDescription("Choose the career you want.")
        .setRequired(true)
        .addChoices(...balancing.jobs.map((job) => ({ name: job.name, value: job.id }))))),
  async execute(interaction, services) {
    const action = interaction.options.getSubcommand();
    if (action === "careers") {
      const status = await services.jobs.view(interaction.guildId, interaction.user.id);
      const lines = status.jobs.map((job) =>
        "**" + job.name + "** · Level " + job.minLevel + "+ · " +
        job.minWallet.toLocaleString() + " FC wallet\n" +
        job.payMin.toLocaleString() + "–" + job.payMax.toLocaleString() + " FC per shift\n" +
        job.description
      );
      return interaction.editReply(embed(
        "💼 CAREER BOARD",
        "Choose a career that matches your level and wallet. A career unlocks three-question work shifts.\n\n**Current career:** " +
        (status.job ? status.job.name + " · Job level " + status.player.job_level : "None"),
        [{ name: "Available careers", value: lines.join("\n\n").slice(0, 3900) }]
      ));
    }

    const result = await services.jobs.apply(
      interaction.guildId,
      interaction.user.id,
      interaction.options.getString("career", true)
    );
    return interaction.editReply(embed(
      "✅ CAREER SELECTED",
      "You are now a **" + result.job.name + "**. Your career is ready; use **/work** to complete a shift.",
      [
        { name: "Pay per shift", value: result.job.payMin.toLocaleString() + "–" + result.job.payMax.toLocaleString() + " FC", inline: true },
        { name: "Work cooldown", value: Math.round(result.job.cooldownMs / 60000) + " minutes", inline: true }
      ],
      0x32865B
    ));
  }
};

const workCommand = {
  data: new SlashCommandBuilder()
    .setName("work")
    .setDescription("Complete a three-question work shift for FC and XP."),
  async execute(interaction, services) {
    const shift = await services.jobs.startShift(interaction.guildId, interaction.user.id);
    const challenge = makeWorkChallenge(shift.job, shift.jobLevel, 3);
    const sessionId = randomUUID().replace(/-/g, "").slice(0, 12);
    let questionIndex = 0;
    let correct = 0;
    let locked = false;

    const prompt = () => {
      const question = challenge.questions[questionIndex];
      const buttons = question.options.map((option) =>
        new ButtonBuilder()
          .setCustomId("work:" + sessionId + ":" + questionIndex + ":" + option.letter)
          .setLabel(option.letter + " · " + option.value.toLocaleString())
          .setStyle(ButtonStyle.Secondary)
      );
      return {
        embeds: [createEmbed({
          title: "🧠 WORK SHIFT  /  QUESTION " + (questionIndex + 1) + " OF 3",
          description: "**Career:** " + shift.job.name + " · Job level " + shift.jobLevel +
            "\n\n" + question.question +
            "\n\nChoose one answer below. Each correct answer increases your shift reward.",
          fields: [{ name: "Progress", value: questionIndex + "/3 answered · " + correct + " correct" }],
          color: 0x851E2A,
          footer: "FUKISHOKAI  •  Work Shift",
          icon: "profile"
        })],
        components: [new ActionRowBuilder().addComponents(...buttons)]
      };
    };

    const message = await interaction.editReply(prompt());
    const prefix = "work:" + sessionId + ":";
    const collector = message.createMessageComponentCollector({
      time: 180000,
      filter: (component) => component.customId.startsWith(prefix)
    });
    const ended = new Promise((resolve) => collector.once("end", (_collected, reason) => resolve(reason)));

    collector.on("collect", async (component) => {
      if (component.user.id !== interaction.user.id) {
        return component.reply({ content: "This is another member's work shift. Start your own with /work.", ephemeral: true });
      }
      const parts = component.customId.split(":");
      const selectedQuestion = Number(parts[2]);
      if (locked || selectedQuestion !== questionIndex) {
        return component.reply({ content: "That question has already been answered. Use the current question buttons.", ephemeral: true });
      }

      locked = true;
      if (parts[3] === challenge.questions[questionIndex].answer) correct += 1;
      questionIndex += 1;
      await component.deferUpdate();

      if (questionIndex < challenge.questions.length) {
        await message.edit(prompt());
      } else {
        await message.edit({
          embeds: [createEmbed({
            title: "✅ SHIFT QUESTIONS COMPLETE",
            description: "You answered **" + correct + "/3** correctly. Calculating your shift result…",
            color: 0x32865B,
            footer: "FUKISHOKAI  •  Work Shift",
            icon: "profile"
          })],
          components: []
        });
        collector.stop("complete");
      }
      locked = false;
    });

    const reason = await ended;
    if (reason !== "complete" || questionIndex !== 3) {
      return interaction.editReply(embed(
        "⏱️ WORK SHIFT EXPIRED",
        "The shift timed out before all three questions were answered. No FC or XP was awarded; the normal work cooldown still applies.",
        [{ name: "Answered", value: questionIndex + "/3 · " + correct + " correct" }],
        0xB77A28
      ));
    }
    if (correct === 0) {
      return interaction.editReply(embed(
        "SHIFT FINISHED",
        "You answered **0/3** correctly, so this shift did not earn FC or XP. Review the questions and try again after the cooldown.",
        [],
        0xB77A28
      ));
    }

    const result = await services.jobs.completeShift(
      interaction.guildId,
      interaction.user.id,
      shift.job.id,
      correct,
      3,
      memberRoleIds(interaction)
    );
    const fields = [
      { name: "Shift pay", value: "+" + result.pay.toLocaleString() + " FC", inline: true },
      { name: "XP earned", value: "+" + result.progression.gained + " XP", inline: true },
      { name: "Correct answers", value: correct + "/3", inline: true },
      { name: "Job level", value: String(result.jobLevel), inline: true }
    ];
    if (result.candyDrop) fields.push({ name: "Candy found", value: "+" + result.candyDrop.amount, inline: true });
    if (result.promoted) fields.push({ name: "Promotion", value: "Your career advanced to job level " + result.jobLevel + ".", inline: false });
    return interaction.editReply(embed(
      "💼 WORK SHIFT COMPLETE",
      "Good work. Your answers have been scored and your rewards have been added.",
      fields,
      0x32865B
    ));
  }
};

const crimeCommand = {
  data: new SlashCommandBuilder()
    .setName("crime")
    .setDescription("Attempt an operation for a chance to earn FC.")
    .addStringOption((option) => option
      .setName("operation")
      .setDescription("Choose an operation. Higher tiers need higher levels.")
      .setRequired(true)
      .addChoices(...balancing.crimes.map((crime) => ({ name: crime.name + " · Level " + crime.minLevel + "+", value: crime.id })))),
  async execute(interaction, services) {
    const result = await services.crime.attempt(
      interaction.guildId,
      interaction.user.id,
      interaction.options.getString("operation", true),
      memberRoleIds(interaction)
    );
    const fields = [
      { name: "Success chance", value: result.successChance + "%", inline: true },
      { name: result.succeeded ? "Reward" : "Fine", value: (result.succeeded ? result.reward : result.fine).toLocaleString() + " FC", inline: true }
    ];
    if (result.candyDrop) fields.push({ name: "Candy found", value: "+" + result.candyDrop.amount, inline: true });
    return interaction.editReply(embed(
      result.succeeded ? "✅ OPERATION SUCCESSFUL" : "🚨 OPERATION FAILED",
      result.succeeded
        ? "You completed **" + result.crime.name + "** and earned **" + result.reward.toLocaleString() + " FC**."
        : "You were caught during **" + result.crime.name + "** and paid a **" + result.fine.toLocaleString() + " FC** fine.",
      fields,
      result.succeeded ? 0x32865B : 0xB77A28
    ));
  }
};

const casinoCommand = {
  data: new SlashCommandBuilder()
    .setName("casino")
    .setDescription("Play Coin Flip, High Dice or Slots with FS Coins.")
    .addStringOption((option) => option
      .setName("game")
      .setDescription("Choose a casino game.")
      .setRequired(true)
      .addChoices(
        { name: "Coin Flip · Level 1+", value: "coinflip" },
        { name: "High Dice · Level 3+", value: "dice" },
        { name: "Slots · Level 5+", value: "slots" }
      ))
    .addIntegerOption((option) => option
      .setName("bet")
      .setDescription("How many FC to bet? Minimum 100 FC; no maximum bet.")
      .setMinValue(100)
      .setRequired(true)),
  async execute(interaction, services) {
    const result = await services.casino.play(
      interaction.guildId,
      interaction.user.id,
      interaction.options.getString("game", true),
      interaction.options.getInteger("bet", true)
    );
    const net = result.net;
    const color = net > 0 ? 0x32865B : net < 0 ? 0xB77A28 : 0x7C7C7C;
    const fields = [
      { name: "Bet", value: result.wager.toLocaleString() + " FC", inline: true },
      { name: "Payout", value: result.payout.toLocaleString() + " FC", inline: true },
      { name: "Net result", value: (net > 0 ? "+" : "") + net.toLocaleString() + " FC", inline: true },
      { name: "Game return", value: Math.round(result.theoreticalReturnRate * 100) + "% long-run average", inline: false }
    ];
    if (result.effectiveChance !== null) fields.push({ name: "Win chance", value: result.effectiveChance.toFixed(2) + "%", inline: true });
    if (result.candyDrop) fields.push({ name: "Candy found", value: "+" + result.candyDrop.amount, inline: true });
    return interaction.editReply(embed(
      result.won ? "🎰 " + result.game.name.toUpperCase() + "  /  WIN" : "🎰 " + result.game.name.toUpperCase() + "  /  ROUND OVER",
      result.outcome,
      fields,
      color
    ));
  }
};

const leaderboardCommand = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View Fukishokai's wealth, level, earnings or party-game rankings.")
    .addStringOption((option) => option
      .setName("ranking")
      .setDescription("Choose what you want to rank.")
      .setRequired(true)
      .addChoices(
        { name: "Total wealth", value: "wealth" },
        { name: "Player level", value: "level" },
        { name: "Lifetime FC earned", value: "earned" },
        { name: "Party Points", value: "party" }
      )),
  async execute(interaction, services) {
    const metric = interaction.options.getString("ranking", true);
    if (metric === "party") {
      const rows = await services.partyGames.leaderboard(interaction.guildId, 10);
      const lines = rows.map((row, index) =>
        "**" + (index + 1) + ".** <@" + row.user_id + "> · " +
        Number(row.points).toLocaleString() + " points · " + Number(row.wins).toLocaleString() + " wins"
      );
      return interaction.editReply(embed(
        "🏆 PARTY POINTS LEADERBOARD",
        lines.length ? lines.join("\n") : "No party-game results yet. Start a round with **/play**."
      ));
    }
    const rows = await getLeaderboard(services.pool, interaction.guildId, metric, 10);
    const lines = rows.map((row, index) => {
      const score = Number(row.score);
      const value = metric === "level" ? "Level " + score : score.toLocaleString() + (metric === "wealth" ? " FC" : " FC earned");
      return "**" + (index + 1) + ".** <@" + row.user_id + "> · " + value;
    });
    const title = metric === "wealth" ? "WEALTH" : metric === "level" ? "PLAYER LEVEL" : "LIFETIME EARNINGS";
    return interaction.editReply(embed(
      "🏆 " + title + " LEADERBOARD",
      lines.length ? lines.join("\n") : "No leaderboard data is available yet."
    ));
  }
};

const bossCommand = {
  data: new SlashCommandBuilder()
    .setName("boss")
    .setDescription("Join the server's optional weekly cooperative boss fight.")
    .addSubcommand((subcommand) => subcommand.setName("status").setDescription("See the boss's remaining health and your contribution."))
    .addSubcommand((subcommand) => subcommand.setName("attack").setDescription("Attack the boss and earn a small FC and XP reward."))
    .addSubcommand((subcommand) => subcommand.setName("leaderboard").setDescription("See who has dealt the most damage this week."))
    .addSubcommand((subcommand) => subcommand.setName("claim").setDescription("Claim rewards from weekly bosses your server defeated.")),
  async execute(interaction, services) {
    const action = interaction.options.getSubcommand();
    if (action === "status") {
      const status = await services.guildBoss.status(interaction.guildId, interaction.user.id);
      const boss = status.boss;
      const hp = Number(boss.hp);
      const maxHp = Number(boss.max_hp);
      const leaders = status.leaders.map((row, index) =>
        "**" + (index + 1) + ".** <@" + row.userId + "> · " + row.damage.toLocaleString() + " damage"
      );
      return interaction.editReply(embed(
        "🛡️ WEEKLY BOSS  /  " + boss.boss_name.toUpperCase(),
        boss.description + "\n\n**Health:** " + hp.toLocaleString() + " / " + maxHp.toLocaleString() +
          "\n" + bar(maxHp - hp, maxHp) + " defeated" +
          "\n**Week starts:** " + status.periodStart +
          (boss.status === "defeated" ? "\n\n<:none:0> **Boss defeated!** Use /boss claim if you contributed." : "\n\nUse **/boss attack** to help your server."),
        [
          { name: "Your damage", value: status.contribution.damage.toLocaleString(), inline: true },
          { name: "Your attacks", value: status.contribution.attacks.toLocaleString(), inline: true },
          { name: "Top contributors", value: leaders.length ? leaders.join("\n") : "No one has attacked yet.", inline: false }
        ],
        boss.status === "defeated" ? 0x32865B : 0x851E2A
      ));
    }

    if (action === "attack") {
      const result = await services.guildBoss.attack(interaction.guildId, interaction.user.id);
      return interaction.editReply(embed(
        result.defeated ? "🏆 THE BOSS HAS FALLEN" : "⚔️ BOSS HIT LANDED",
        "You dealt **" + result.damage.toLocaleString() + " damage** to **" + result.bossName + "**.\n\n" +
          "**Boss health:** " + result.hp.toLocaleString() + " / " + result.maxHp.toLocaleString() +
          (result.defeated ? "\n\nYour server defeated the weekly boss! Contributors can claim a clear reward with **/boss claim**." : ""),
        [
          { name: "Attack reward", value: "+" + result.rewardFc.toLocaleString() + " FC", inline: true },
          { name: "XP earned", value: "+" + result.rewardXp + " XP", inline: true }
        ],
        result.defeated ? 0x32865B : 0x851E2A
      ));
    }

    if (action === "leaderboard") {
      const rows = await services.guildBoss.leaderboard(interaction.guildId, 10);
      const lines = rows.map((row, index) =>
        "**" + (index + 1) + ".** <@" + row.userId + "> · " +
        row.damage.toLocaleString() + " damage · " + row.attacks + " attacks"
      );
      return interaction.editReply(embed(
        "⚔️ WEEKLY BOSS CONTRIBUTIONS",
        lines.length ? lines.join("\n") : "No one has attacked this week's boss yet. Reach level 3 and join in."
      ));
    }

    const result = await services.guildBoss.claimRewards(interaction.guildId, interaction.user.id);
    const history = result.claimed.map((item) =>
      "**" + item.bossName + "** · #" + item.rank + " · +" +
      item.fc.toLocaleString() + " FC · +" + item.xp + " XP"
    );
    return interaction.editReply(embed(
      "🎁 BOSS CLEAR REWARDS CLAIMED",
      "You claimed **" + result.claimed.length + "** boss-clear reward(s).\n\n" + history.join("\n"),
      [
        { name: "Total FC", value: "+" + result.totalFc.toLocaleString(), inline: true },
        { name: "Total XP", value: "+" + result.totalXp.toLocaleString(), inline: true }
      ],
      0x32865B
    ));
  }
};

const guideCommand = {
  data: new SlashCommandBuilder()
    .setName("guide")
    .setDescription("See the main Fukishokai commands and what each one does."),
  async execute(interaction) {
    return interaction.editReply(embed(
      "📖 FUKISHOKAI  /  QUICK GUIDE",
      "Start with **/profile** to see your progress. Commands are shortcuts to the same game systems in /menu.",
      [
        { name: "💰 Earn and progress", value: "**/daily** — claim your daily FC and XP.\n**/job careers** — compare careers.\n**/job apply** — choose a career.\n**/work** — answer three questions for shift pay." },
        { name: "🎮 Take part", value: "**/crime** — choose an operation and see its success chance.\n**/casino** — play Coin Flip, High Dice or Slots.\n**/play** — launch multiplayer party games." },
        { name: "🛡️ Weekly team goal", value: "**/boss status** — check the shared boss.\n**/boss attack** — deal damage (level 3+, once every 8 hours).\n**/boss leaderboard** — see contributors.\n**/boss claim** — collect rewards after a clear." },
        { name: "🏆 Check your standing", value: "**/profile** — view a member's progress.\n**/leaderboard** — compare wealth, levels, lifetime earnings or Party Points.\n**/menu** — open the full interactive dashboard." }
      ]
    ));
  }
};

module.exports = {
  dailyCommand,
  profileCommand,
  jobCommand,
  workCommand,
  crimeCommand,
  casinoCommand,
  leaderboardCommand,
  bossCommand,
  guideCommand
};
