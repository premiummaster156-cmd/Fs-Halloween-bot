const {
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require("discord.js");
const { randomUUID } = require("node:crypto");
const { randomInt } = require("../utils/core");
const { createEmbed } = require("../ui");
const {
  makeTriviaQuestion, makeWouldYouRather, makeRoast, makeFortune, resolveRps
} = require("../games/party");

function row(...buttons) {
  return new ActionRowBuilder().addComponents(...buttons);
}
function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}
function mentionSafe() {
  return { parse: [] };
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function safeDisplayName(user) {
  return String(user?.globalName || user?.username || "Player")
    .replace(/[\\`*_~|]/g, "")
    .replace(/@/g, "@\\u200b")
    .slice(0, 48);
}
function gameId() {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}
function render(title, description, fields = [], color) {
  return createEmbed({
    title,
    description,
    fields,
    color: color ?? 0x851E2A,
    footer: "FUKISHOKAI  •  Party Games",
    icon: "profile"
  });
}
async function waitForCollector(collector) {
  return new Promise((resolve) => collector.once("end", resolve));
}
async function playQuickDraw(interaction, services) {
  const id = gameId();
  const joinId = "party:" + id + ":join";
  const drawId = "party:" + id + ":draw";
  const entrants = new Map();
  const lobbyMessage = await interaction.editReply({
    embeds: [render(
      "⚡ QUICK DRAW ARENA",
      "A reaction race is starting. Press **JOIN RACE** to enter. You have 12 seconds to get in.\n\n" +
      "At least two players are needed. Once the screen says **WAIT**, do not click until it changes to **DRAW!**. Early clicks are false starts."
    )],
    components: [row(button(joinId, "Join race", ButtonStyle.Success))],
    allowedMentions: mentionSafe()
  });

  const lobby = lobbyMessage.createMessageComponentCollector({
    time: 12000,
    filter: (component) => component.customId === joinId
  });
  lobby.on("collect", async (component) => {
    if (entrants.has(component.user.id)) {
      return component.reply({ content: "You're already in the race. Save those fast fingers.", flags: MessageFlags.Ephemeral });
    }
    if (entrants.size >= 25) {
      return component.reply({ content: "The race lobby is full. The maximum is 25 players.", flags: MessageFlags.Ephemeral });
    }
    entrants.set(component.user.id, safeDisplayName(component.user));
    await component.deferUpdate();
    const names = Array.from(entrants.values()).map((name) => "• " + name).join("\n");
    await lobbyMessage.edit({
      embeds: [render("⚡ QUICK DRAW ARENA", "Players in the lobby: **" + entrants.size + "** / 25\n\n" + names)]
    });
  });
  await waitForCollector(lobby);

  if (entrants.size < 2) {
    await lobbyMessage.edit({
      embeds: [render("RACE CANCELLED", "Only **" + entrants.size + "** player joined. A proper race needs at least two people. Try again when the squad is around.")],
      components: []
    });
    return;
  }

  const falseStarts = new Set();
  let goAt = 0;
  let winnerId = null;
  let reactionMs = null;
  await lobbyMessage.edit({
    embeds: [render(
      "⚡ GET READY",
      "Players: **" + entrants.size + "**\n\n⏳ **WAIT FOR THE SIGNAL.**\n\nClicking early gets you disqualified."
    )],
    components: [row(button(drawId, "WAIT...", ButtonStyle.Secondary))]
  });

  const race = lobbyMessage.createMessageComponentCollector({
    time: 10000,
    filter: (component) => component.customId === drawId
  });
  race.on("collect", async (component) => {
    if (!entrants.has(component.user.id)) {
      return component.reply({ content: "You didn't join this race. Catch the next one!", flags: MessageFlags.Ephemeral });
    }
    if (falseStarts.has(component.user.id)) {
      return component.reply({ content: "You already false-started. You're out of this round.", flags: MessageFlags.Ephemeral });
    }
    if (!goAt) {
      falseStarts.add(component.user.id);
      await component.reply({ content: "FALSE START! You clicked before the signal. You're disqualified.", flags: MessageFlags.Ephemeral });
      await lobbyMessage.edit({
        embeds: [render(
          "⚡ GET READY",
          "Players: **" + entrants.size + "**\nFalse starts: **" + falseStarts.size + "**\n\n**WAIT FOR DRAW!**"
        )]
      });
      return;
    }
    if (winnerId) {
      return component.reply({ content: "The race already has a winner.", flags: MessageFlags.Ephemeral });
    }
    winnerId = component.user.id;
    reactionMs = Math.max(0, Date.now() - goAt);
    await component.reply({ content: "You won the Quick Draw race in **" + reactionMs + " ms**! +" + (12 + 1) + " Party Points.", flags: MessageFlags.Ephemeral });
    race.stop("winner");
  });

  await delay(randomInt(2200, 5200));
  goAt = Date.now();
  await lobbyMessage.edit({
    embeds: [render("🟢 DRAW! DRAW! DRAW!", "The signal is live. First valid click wins.\n\nPlayers still in: **" + (entrants.size - falseStarts.size) + "**")],
    components: [row(button(drawId, "DRAW!", ButtonStyle.Success))]
  });
  await waitForCollector(race);

  for (const userId of entrants.keys()) {
    if (falseStarts.has(userId)) continue;
    const won = userId === winnerId;
    await services.partyGames.record(interaction.guildId, userId, { points: won ? 13 : 1, won });
  }
  const result = winnerId
    ? "**Winner:** <@" + winnerId + ">\n**Reaction time:** " + reactionMs + " ms\n**False starts:** " + falseStarts.size + "\n**Reward:** 13 Party Points"
    : "Nobody hit the button in time. The signal has left the building.";
  await lobbyMessage.edit({
    embeds: [render(winnerId ? "🏆 QUICK DRAW RESULT" : "⏱️ TOO SLOW", result)],
    components: [],
    allowedMentions: mentionSafe()
  });
}

async function playTrivia(interaction, services) {
  const id = gameId();
  const trivia = makeTriviaQuestion();
  const answerIds = trivia.options.map((_, index) => "party:" + id + ":answer:" + index);
  const components = row(...trivia.options.map((option, index) =>
    button(answerIds[index], String.fromCharCode(65 + index) + " · " + option, ButtonStyle.Secondary)
  ));
  const message = await interaction.editReply({
    embeds: [render(
      "🧠 FUKISHOKAI LIVE TRIVIA",
      "**Category:** " + trivia.category + "\n\n" + trivia.question +
      "\n\nFirst correct answer wins **12 Party Points**. Each player gets one attempt. Wrong answers are private."
    )],
    components: [components],
    allowedMentions: mentionSafe()
  });
  const answered = new Set();
  let winnerId = null;
  const collector = message.createMessageComponentCollector({
    time: 35000,
    filter: (component) => answerIds.includes(component.customId)
  });
  collector.on("collect", async (component) => {
    if (answered.has(component.user.id)) {
      return component.reply({ content: "Your answer is already locked. Let someone else have a turn.", flags: MessageFlags.Ephemeral });
    }
    answered.add(component.user.id);
    const index = answerIds.indexOf(component.customId);
    if (index === trivia.correctIndex) {
      winnerId = component.user.id;
      await component.reply({ content: "Correct! You were the first to solve it. You win **12 Party Points**.", flags: MessageFlags.Ephemeral });
      collector.stop("winner");
      return;
    }
    await component.reply({ content: "Not quite. Your answer is locked for this round, but no points were lost.", flags: MessageFlags.Ephemeral });
  });
  await waitForCollector(collector);

  for (const userId of answered) {
    await services.partyGames.record(interaction.guildId, userId, {
      points: userId === winnerId ? 12 : 1,
      won: userId === winnerId
    });
  }
  await message.edit({
    embeds: [render(
      winnerId ? "🏆 TRIVIA WINNER" : "🧠 TRIVIA ANSWER",
      (winnerId ? "First correct answer: <@" + winnerId + ">\n\n" : "Nobody answered correctly in time.\n\n") +
      "**Correct answer:** " + trivia.answer + "\n**Players who tried:** " + answered.size +
      (winnerId ? "\n**Reward:** 12 Party Points" : ""),
      [],
      winnerId ? 0x32865B : 0xB77A28
    )],
    components: [],
    allowedMentions: mentionSafe()
  });
}

async function playWouldYouRather(interaction, services) {
  const id = gameId();
  const prompt = makeWouldYouRather();
  const firstId = "party:" + id + ":wyr:a";
  const secondId = "party:" + id + ":wyr:b";
  const votes = new Map();
  const message = await interaction.editReply({
    embeds: [render(
      "🤔 WOULD YOU RATHER?",
      "Pick one. No explanations required, but the group chat may judge you.\n\n" +
      "**A:** " + prompt.first + "\n\n**B:** " + prompt.second + "\n\nVoting stays open for 45 seconds."
    )],
    components: [row(
      button(firstId, "A · Option one", ButtonStyle.Primary),
      button(secondId, "B · Option two", ButtonStyle.Success)
    )],
    allowedMentions: mentionSafe()
  });
  const collector = message.createMessageComponentCollector({
    time: 45000,
    filter: (component) => component.customId === firstId || component.customId === secondId
  });
  collector.on("collect", async (component) => {
    if (votes.has(component.user.id)) {
      return component.reply({ content: "You already voted. The democracy is closed to you.", flags: MessageFlags.Ephemeral });
    }
    votes.set(component.user.id, component.customId === firstId ? "A" : "B");
    await component.deferUpdate();
    const a = Array.from(votes.values()).filter((vote) => vote === "A").length;
    const b = votes.size - a;
    await message.edit({
      embeds: [render(
        "🤔 WOULD YOU RATHER?",
        "**A:** " + prompt.first + "\n**B:** " + prompt.second +
        "\n\n**Live votes**\nA: **" + a + "**  ·  B: **" + b + "**  ·  Total: **" + votes.size + "**\n\nVoting closes after 45 seconds."
      )]
    });
  });
  await waitForCollector(collector);

  for (const userId of votes.keys()) {
    await services.partyGames.record(interaction.guildId, userId, { points: 2, won: false });
  }
  const a = Array.from(votes.values()).filter((vote) => vote === "A").length;
  const b = votes.size - a;
  const verdict = a === b ? "It's a tie. Nobody can make a decision." : a > b ? "Option A wins. The server has spoken." : "Option B wins. The server has spoken.";
  await message.edit({
    embeds: [render(
      "🗳️ THE SERVER HAS DECIDED",
      "**A:** " + prompt.first + " — **" + a + " votes**\n" +
      "**B:** " + prompt.second + " — **" + b + " votes**\n\n" + verdict +
      "\n\nVoters earned **2 Party Points** each."
    )],
    components: []
  });
}

async function playDuel(interaction, services) {
  return playDuelWithOpponent(interaction, services, interaction.options.getUser("opponent", true));
}

async function playDuelWithOpponent(interaction, services, opponent) {
  if (opponent.id === interaction.user.id) throw new Error("You cannot challenge yourself. Even you deserve a worthy opponent.");
  if (opponent.bot) throw new Error("Bots do not duel. They have enough unfair advantages already.");
  const opponentMember = await interaction.guild.members.fetch(opponent.id).catch(() => null);
  if (!opponentMember) throw new Error("That opponent is not a member of this server.");
  const id = gameId();
  const acceptId = "party:" + id + ":accept";
  const declineId = "party:" + id + ":decline";
  const message = await interaction.editReply({
    embeds: [render(
      "🥊 DUEL CHALLENGE",
      "<@" + interaction.user.id + "> challenged <@" + opponent.id + "> to Rock–Paper–Scissors.\n\n" +
      "The challenged player has **30 seconds** to accept or decline. Winner earns 12 Party Points."
    )],
    components: [row(
      button(acceptId, "Accept duel", ButtonStyle.Success),
      button(declineId, "Decline", ButtonStyle.Danger)
    )],
    allowedMentions: mentionSafe()
  });
  const challenge = message.createMessageComponentCollector({
    time: 30000,
    filter: (component) => component.customId === acceptId || component.customId === declineId
  });
  let accepted = false;
  let declined = false;
  challenge.on("collect", async (component) => {
    if (component.user.id !== opponent.id) {
      return component.reply({ content: "This challenge is for <@" + opponent.id + "> only.", flags: MessageFlags.Ephemeral, allowedMentions: mentionSafe() });
    }
    if (component.customId === declineId) {
      declined = true;
      await component.deferUpdate();
      challenge.stop("declined");
      return;
    }
    accepted = true;
    await component.deferUpdate();
    challenge.stop("accepted");
  });
  await waitForCollector(challenge);

  if (!accepted) {
    await message.edit({
      embeds: [render(declined ? "DUEL DECLINED" : "CHALLENGE EXPIRED",
        declined ? "<@" + opponent.id + "> declined the duel. No hard feelings. Probably." : "The challenge expired. Your opponent may be training in secret.")],
      components: [],
      allowedMentions: mentionSafe()
    });
    return;
  }

  const choiceIds = ["rock", "paper", "scissors"].map((choice) => "party:" + id + ":rps:" + choice);
  const choices = new Map();
  const choiceMessage = await message.edit({
    embeds: [render(
      "🥊 ROCK · PAPER · SCISSORS",
      "<@" + interaction.user.id + "> vs <@" + opponent.id + ">\n\nBoth players must secretly choose one move. Your choice stays hidden until both have locked in."
    )],
    components: [row(
      button(choiceIds[0], "🪨 Rock"),
      button(choiceIds[1], "📄 Paper"),
      button(choiceIds[2], "✂️ Scissors")
    )],
    allowedMentions: mentionSafe()
  });
  let outcome = null;
  const game = choiceMessage.createMessageComponentCollector({
    time: 45000,
    filter: (component) => choiceIds.includes(component.customId)
  });
  game.on("collect", async (component) => {
    const allowed = component.user.id === interaction.user.id || component.user.id === opponent.id;
    if (!allowed) {
      return component.reply({ content: "This is a private duel between the two challenged players.", flags: MessageFlags.Ephemeral });
    }
    if (choices.has(component.user.id)) {
      return component.reply({ content: "Your move is already locked. No take-backs.", flags: MessageFlags.Ephemeral });
    }
    const choice = component.customId.split(":").at(-1);
    choices.set(component.user.id, choice);
    await component.reply({ content: "Move locked. Waiting for the other player...", flags: MessageFlags.Ephemeral });
    await choiceMessage.edit({
      embeds: [render(
        "🥊 MOVES LOCKED",
        "<@" + interaction.user.id + ">: **" + (choices.has(interaction.user.id) ? "Ready" : "Choosing...") + "**\n" +
        "<@" + opponent.id + ">: **" + (choices.has(opponent.id) ? "Ready" : "Choosing...") + "**\n\nYour actual moves are still hidden."
      )],
      allowedMentions: mentionSafe()
    });
    if (choices.size === 2) {
      const result = resolveRps(choices.get(interaction.user.id), choices.get(opponent.id));
      outcome = result === "tie"
        ? { winnerId: null, result }
        : { winnerId: result === "first" ? interaction.user.id : opponent.id, result };
      game.stop("complete");
    }
  });
  await waitForCollector(game);

  if (outcome) {
    const firstMove = choices.get(interaction.user.id);
    const secondMove = choices.get(opponent.id);
    if (outcome.result === "tie") {
      await services.partyGames.record(interaction.guildId, interaction.user.id, { points: 5, won: false });
      await services.partyGames.record(interaction.guildId, opponent.id, { points: 5, won: false });
      await choiceMessage.edit({
        embeds: [render("🤝 IT'S A DRAW", "Both chose **" + firstMove + "**.\n\nNobody wins this round, but both players earn **5 Party Points**.")],
        components: []
      });
    } else {
      const loserId = outcome.winnerId === interaction.user.id ? opponent.id : interaction.user.id;
      await services.partyGames.record(interaction.guildId, outcome.winnerId, { points: 12, won: true });
      await services.partyGames.record(interaction.guildId, loserId, { points: 3, won: false });
      await choiceMessage.edit({
        embeds: [render(
          "🏆 DUEL COMPLETE",
          "**Winner:** <@" + outcome.winnerId + ">\n" +
          "<@" + interaction.user.id + "> chose **" + firstMove + "**\n" +
          "<@" + opponent.id + "> chose **" + secondMove + "**\n\n" +
          "Winner: **12 Party Points** · Other player: **3 Party Points**",
          [],
          0x32865B
        )],
        components: [],
        allowedMentions: mentionSafe()
      });
    }
    return;
  }

  for (const userId of choices.keys()) {
    await services.partyGames.record(interaction.guildId, userId, { points: 1, won: false });
  }
  await choiceMessage.edit({
    embeds: [render("⏱️ DUEL EXPIRED", "Both players did not lock in their moves before time ran out. " +
      (choices.size ? "Players who locked in earned 1 Party Point." : "No points were awarded."))],
    components: []
  });
}

async function showLeaderboard(interaction, services) {
  const entries = await services.partyGames.leaderboard(interaction.guildId, 10);
  if (!entries.length) {
    return interaction.editReply({
      embeds: [render("🏆 PARTY LEADERBOARD", "No Party Points yet. Start a game and put your name on the board.")],
      components: []
    });
  }
  const lines = entries.map((entry, index) =>
    "**" + (index + 1) + ".** <@" + entry.user_id + "> — **" + Number(entry.points).toLocaleString() +
    " points** · " + Number(entry.wins) + " wins · " + Number(entry.games) + " games"
  );
  return interaction.editReply({
    embeds: [render("🏆 PARTY LEADERBOARD", lines.join("\n"))],
    allowedMentions: mentionSafe()
  });
}

async function showStats(interaction, services) {
  const user = interaction.options.getUser("member") || interaction.user;
  const stats = await services.partyGames.getStats(interaction.guildId, user.id);
  return interaction.editReply({
    embeds: [render(
      "🎮 PARTY PROFILE",
      "**Player:** <@" + user.id + ">",
      [
        { name: "Party Points", value: Number(stats.points).toLocaleString(), inline: true },
        { name: "Wins", value: Number(stats.wins).toLocaleString(), inline: true },
        { name: "Games played", value: Number(stats.games).toLocaleString(), inline: true },
        { name: "Current win streak", value: String(Number(stats.current_streak)), inline: true },
        { name: "Best win streak", value: String(Number(stats.best_streak)), inline: true }
      ]
    )],
    allowedMentions: mentionSafe()
  });
}

const playCommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Start quick multiplayer games and check Party Points.")
    .addSubcommand((sub) => sub.setName("quick-draw").setDescription("Race the server to click at exactly the right moment."))
    .addSubcommand((sub) => sub.setName("trivia").setDescription("A live four-choice trivia race. First correct answer wins."))
    .addSubcommand((sub) => sub.setName("would-you-rather").setDescription("Start a funny server-wide vote."))
    .addSubcommand((sub) => sub.setName("duel").setDescription("Challenge a member to Rock–Paper–Scissors.")
      .addUserOption((option) => option.setName("opponent").setDescription("The member you want to challenge.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("leaderboard").setDescription("See the top Party Points players."))
    .addSubcommand((sub) => sub.setName("stats").setDescription("See your or another member's Party Games record.")
      .addUserOption((option) => option.setName("member").setDescription("Member whose record you want to view.").setRequired(false))),
  async execute(interaction, services) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "quick-draw") return playQuickDraw(interaction, services);
    if (subcommand === "trivia") return playTrivia(interaction, services);
    if (subcommand === "would-you-rather") return playWouldYouRather(interaction, services);
    if (subcommand === "duel") return playDuel(interaction, services);
    if (subcommand === "leaderboard") return showLeaderboard(interaction, services);
    if (subcommand === "stats") return showStats(interaction, services);
    throw new Error("Unknown Party Games mode.");
  }
};

const roastCommand = {
  data: new SlashCommandBuilder()
    .setName("roast")
    .setDescription("Give someone a harmless, randomly generated Fukishokai roast.")
    .addUserOption((option) => option.setName("member").setDescription("Who gets roasted?").setRequired(true)),
  async execute(interaction) {
    const target = interaction.options.getUser("member", true);
    if (target.bot) throw new Error("The roast machine only accepts human members. Bots already get roasted by their uptime.");
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const name = member?.displayName || target.globalName || target.username;
    const line = makeRoast(name);
    return interaction.editReply({
      embeds: [render("🔥 THE ROAST MACHINE", line, [], 0xB83D47)],
      allowedMentions: mentionSafe()
    });
  }
};

const fortuneCommand = {
  data: new SlashCommandBuilder()
    .setName("fortune")
    .setDescription("Draw your once-a-day Fukishokai chaos fortune."),
  async execute(interaction, services) {
    await services.partyGames.claimDailyFortune(interaction.guildId, interaction.user.id);
    const card = makeFortune();
    return interaction.editReply({
      embeds: [render(
        "🔮 YOUR DAILY CHAOS FORTUNE",
        "**" + card.title + "**\n\n" + card.vibe,
        [
          { name: "Today's mini-mission", value: card.mission, inline: false },
          { name: "⚠️ Warning from the universe", value: card.warning, inline: false }
        ],
        0x6D4A92
      )]
    });
  }
};

module.exports = { playCommand, roastCommand, fortuneCommand, playQuickDraw, playTrivia, playWouldYouRather, playDuelWithOpponent, showLeaderboard, showStats };
