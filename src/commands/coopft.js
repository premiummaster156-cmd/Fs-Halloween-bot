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

const ticketCommand = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a private CoopFT support ticket.")
    .addStringOption((option) => option
      .setName("type")
      .setDescription("What do you need help with?")
      .setRequired(true)
      .addChoices(
        { name: "General support", value: "support" },
        { name: "Report a bug", value: "bug" },
        { name: "Custom bot request", value: "custom_bot" },
        { name: "Suggestion", value: "suggestion" }
      )),
  async execute(interaction, services) {
    await interaction.deferReply({ ephemeral: true });
    const result = await services.coopft.openTicket(
      interaction.guild,
      interaction.member,
      interaction.options.getString("type", true)
    );
    return interaction.editReply({
      content: result.existing
        ? "You already have an open ticket: <#" + result.channel.id + ">."
        : "Your private ticket is ready: <#" + result.channel.id + ">."
    });
  }
};

const commands = [staffCommand, ticketCommand];

function loadCoopFTCommands() {
  const map = new Map();
  for (const command of commands) {
    if (map.has(command.data.name)) throw new Error("Duplicate CoopFT command: " + command.data.name);
    map.set(command.data.name, command);
  }
  return map;
}

module.exports = { loadCoopFTCommands };
