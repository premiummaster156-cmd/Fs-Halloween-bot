const { SlashCommandBuilder } = require("discord.js");
const { openMenu, openAdmin } = require("./dashboard");
const { leaderboardCommand, profileCommand } = require("./gameplay");

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("menu")
      .setDescription("Open your private Fukishokai game dashboard."),
    async execute(interaction, services) {
      return openMenu(interaction, services);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName("admin-panel")
      .setDescription("Open the private Fukishokai administration console."),
    async execute(interaction, services) {
      return openAdmin(interaction, services);
    }
  },
  profileCommand,
  leaderboardCommand
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
