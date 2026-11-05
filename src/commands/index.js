const { SlashCommandBuilder } = require("discord.js");
const { respond } = require("../ui");
const { openMenu, openAdmin } = require("./dashboard");
const { playCommand, roastCommand, fortuneCommand } = require("./party");

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
      .setName("admin")
      .setDescription("Open the private Fukishokai administration console.")
      .addSubcommand((subcommand) => subcommand
        .setName("panel")
        .setDescription("Manage server settings, events, players and rankings.")),
    async execute(interaction, services) {
      return openAdmin(interaction, services);
    }
  },
  playCommand,
  roastCommand,
  fortuneCommand
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
