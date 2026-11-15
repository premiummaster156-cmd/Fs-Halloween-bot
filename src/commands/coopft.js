"use strict";

const { SlashCommandBuilder } = require("discord.js");

const staffCommand = {
  data: new SlashCommandBuilder()
    .setName("staff")
    .setDescription("View the official CoopFT staff directory."),
  async execute(interaction, services) {
    const embed = await services.coopft.buildStaffDirectoryEmbed(interaction.guild);
    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  }
};

const commands = [staffCommand];

function loadCoopFTCommands() {
  const map = new Map();
  for (const command of commands) {
    if (map.has(command.data.name)) throw new Error("Duplicate CoopFT command: " + command.data.name);
    map.set(command.data.name, command);
  }
  return map;
}

module.exports = { loadCoopFTCommands };
