const {
  SlashCommandBuilder,
  AttachmentBuilder,
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
const { ACHIEVEMENTS } = require("../games/achievements");
const { createProfileCard } = require("../utils/profile-card");

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
    .setDescription("View your profile or another member's game rank card.")
    .addUserOption((option) => option
      .setName("member")
      .setDescription("Whose profile should be shown?")
      .setRequired(false)),
  async execute(interaction, services) {
    const member = interaction.options.getUser("member") || interaction.user;
    const player = await getPlayer(services.pool, interaction.guildId, member.id);
    const rankResult = await services.pool.query(
      "SELECT COUNT(*)::int + 1 AS rank FROM players p WHERE p.guild_id = $1 AND " +
      "(p.level > $2 OR (p.level = $2 AND p.user_id < $3)) AND " +
      "NOT EXISTS (SELECT 1 FROM leaderboard_exclusions x WHERE x.guild_id = p.guild_id AND x.user_id = p.user_id)",
      [interaction.guildId, Number(player.level) || 1, member.id]
    );
    const rank = Number(rankResult.rows[0]?.rank) || 1;
    const image = await createProfileCard({ user: member, player, rank });
    const attachment = new AttachmentBuilder(image, { name: "fukishokai-profile.png" });
    return interaction.editReply({
      content: "",
      files: [attachment],
      allowedMentions: { parse: [] }
    });
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
    if (result.bankDelta > 0) {
      fields.push({ name: "Saved to bank", value: "+" + result.bankDelta.toLocaleString() + " FC", inline: true });
    }
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
    .setDescription("View Fukishokai's public wealth, level, earnings or party-game rankings.")
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
    const medals = ["🥇", "🥈", "🥉"];
    if (metric === "party") {
      const rows = await services.partyGames.leaderboard(interaction.guildId, 10);
      const lines = rows.map((row, index) => {
        const games = Number(row.games) || 0;
        const wins = Number(row.wins) || 0;
        const winRate = games ? Math.round(wins / games * 100) : 0;
        return (medals[index] || "**#" + (index + 1) + "**") + " <@" + row.user_id + "> · **" +
          Number(row.points).toLocaleString() + " PP** · " + wins.toLocaleString() + "/" +
          games.toLocaleString() + " wins (" + winRate + "%)";
      });
      return interaction.editReply(embed(
        "🏆 PARTY POINTS  /  TOP 10",
        lines.length ? "The server's most active Party Games players.\n\n" + lines.join("\n") : "No party-game results yet.",
        [{ name: "Scoring", value: "Party Points are earned through completed Party Games. Wins, total games and streaks remain part of each player's record." }]
      ));
    }

    const rows = await getLeaderboard(services.pool, interaction.guildId, metric, 10);
    const scoreLabel = (score) => metric === "level"
      ? "Level " + score.toLocaleString()
      : score.toLocaleString() + (metric === "wealth" ? " FC total wealth" : " FC lifetime earned");
    const lines = rows.map((row, index) =>
      (medals[index] || "**#" + (index + 1) + "**") + " <@" + row.user_id + "> · **" + scoreLabel(Number(row.score)) + "**"
    );
    const title = metric === "wealth" ? "TOTAL WEALTH" : metric === "level" ? "PLAYER LEVEL" : "LIFETIME FC EARNED";
    const explanation = metric === "wealth"
      ? "Wallet and bank balances combined."
      : metric === "level" ? "Current player level, with XP used to break ties." : "Total FC earned over the member's lifetime.";
    return interaction.editReply(embed(
      "🏆 " + title + "  /  TOP 10",
      lines.length ? "The server's current leaders.\n\n" + lines.join("\n") : "No leaderboard data is available yet.",
      [{ name: "Ranking metric", value: explanation }]
    ));
  }
};

const achievementsCommand = {
  data: new SlashCommandBuilder()
    .setName("achievements")
    .setDescription("Track permanent milestones and claim one-time rewards.")
    .addSubcommand((subcommand) => subcommand
      .setName("view")
      .setDescription("See achievement progress and rewards."))
    .addSubcommand((subcommand) => subcommand
      .setName("claim")
      .setDescription("Claim a reward for an achievement you completed.")
      .addStringOption((option) => option
        .setName("achievement")
        .setDescription("Choose an unlocked achievement.")
        .setRequired(true)
        .addChoices(...ACHIEVEMENTS.map((item) => ({ name: item.name, value: item.id }))))),
  async execute(interaction, services) {
    const action = interaction.options.getSubcommand();
    if (action === "view") {
      const entries = await services.achievements.status(interaction.guildId, interaction.user.id);
      const claimedCount = entries.filter((item) => item.claimed).length;
      const lines = entries.map((item) => {
        const mark = item.claimed ? "✅" : item.unlocked ? "🎁" : "▫️";
        const progress = item.actual.toLocaleString() + "/" + item.target.toLocaleString();
        const state = item.claimed ? "Claimed" : item.unlocked ? "Ready to claim" : progress;
        return mark + " **" + item.name + "** — " + state +
          (item.claimed ? "" : " · " + item.rewardFc.toLocaleString() + " FC / " + item.rewardXp + " XP") +
          "\n_" + item.description + "_";
      });
      return interaction.editReply(embed(
        "🏅 ACHIEVEMENT BOOK",
        "Permanent milestones for the different ways you play. Progress never expires.\n" +
          "**Rewards claimed:** " + claimedCount + "/" + entries.length + "\n\n" + lines.join("\n\n")
      ));
    }

    const result = await services.achievements.claim(
      interaction.guildId,
      interaction.user.id,
      interaction.options.getString("achievement", true),
      memberRoleIds(interaction)
    );
    return interaction.editReply(embed(
      "🏅 ACHIEVEMENT UNLOCKED",
      "**" + result.achievement.name + "**\n" + result.achievement.description,
      [
        { name: "FS Coins", value: "+" + result.rewardFc.toLocaleString() + " FC", inline: true },
        { name: "XP", value: "+" + result.rewardXp + " XP", inline: true },
        { name: "Player level", value: String(result.level), inline: true }
      ],
      0x32865B
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
  achievementsCommand
};
