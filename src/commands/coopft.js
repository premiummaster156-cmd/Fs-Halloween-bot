const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { STAFF_RANKS } = require("../config/coopft-design");

const staffCommand = {
  data: new SlashCommandBuilder()
    .setName("staff")
    .setDescription("View the CoopFT staff directory."),
  async execute(interaction, services) {
    const embed = await services.coopft.buildStaffDirectoryEmbed(interaction.guild);
    return interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
  }
};

const staffManageCommand = {
  data: new SlashCommandBuilder()
    .setName("staff-manage")
    .setDescription("Hire, promote, demote or remove a CoopFT staff member.")
    .addSubcommand((sub) => sub.setName("hire")
      .setDescription("Hire a member into a staff rank.")
      .addUserOption((o) => o.setName("member").setDescription("Member to hire").setRequired(true))
      .addStringOption((o) => o.setName("rank").setDescription("New staff rank").setRequired(true)
        .addChoices(...STAFF_RANKS.map((r) => ({ name: r.name, value: r.key })))))
    .addSubcommand((sub) => sub.setName("promote")
      .setDescription("Promote or reassign a staff member.")
      .addUserOption((o) => o.setName("member").setDescription("Staff member").setRequired(true))
      .addStringOption((o) => o.setName("rank").setDescription("New staff rank").setRequired(true)
        .addChoices(...STAFF_RANKS.map((r) => ({ name: r.name, value: r.key })))))
    .addSubcommand((sub) => sub.setName("demote")
      .setDescription("Move a staff member to a lower rank.")
      .addUserOption((o) => o.setName("member").setDescription("Staff member").setRequired(true))
      .addStringOption((o) => o.setName("rank").setDescription("New staff rank").setRequired(true)
        .addChoices(...STAFF_RANKS.map((r) => ({ name: r.name, value: r.key })))))
    .addSubcommand((sub) => sub.setName("remove")
      .setDescription("Remove a member from the staff team.")
      .addUserOption((o) => o.setName("member").setDescription("Staff member").setRequired(true))),
  async execute(interaction, services) {
    const subcommand = interaction.options.getSubcommand();
    const memberUser = interaction.options.getUser("member", true);
    const member = await interaction.guild.members.fetch(memberUser.id).catch(() => null);
    if (!member) return interaction.reply({ content: "That member is no longer in this server.", ephemeral: true });
    if (subcommand === "remove") {
      await services.coopft.removeStaff(interaction, member);
      return interaction.reply({ content: "Staff access removed from **" + member.user.tag + "**. The staff directory has been updated.", ephemeral: true });
    }
    const rankKey = interaction.options.getString("rank", true);
    const record = await services.coopft.assignStaff(interaction, member, rankKey, subcommand);
    return interaction.reply({
      content: "✅ **" + member.user.tag + "** is now **" + record.rankName + "**. The staff directory has been updated.",
      ephemeral: true
    });
  }
};

const ticketCommand = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a private CoopFT support ticket.")
    .addStringOption((o) => o.setName("type").setDescription("What do you need help with?").setRequired(true)
      .addChoices(
        { name: "General support", value: "support" },
        { name: "Report a bug", value: "bug" },
        { name: "Custom bot request", value: "custom_bot" },
        { name: "Suggestion", value: "suggestion" }
      )),
  async execute(interaction, services) {
    await interaction.deferReply({ ephemeral: true });
    const result = await services.coopft.openTicket(interaction.guild, interaction.member, interaction.options.getString("type", true));
    return interaction.editReply({
      content: result.existing
        ? "You already have an open ticket: <#" + result.channel.id + ">."
        : "Your private ticket is ready: <#" + result.channel.id + ">."
    });
  }
};

const setupCommand = {
  data: new SlashCommandBuilder()
    .setName("coopft-setup")
    .setDescription("Repair the CoopFT server layout and ticket/staff panels."),
  async execute(interaction, services) {
    if (!services.coopft.canManageStaff(interaction.member, interaction.guild)) {
      return interaction.reply({ content: "Only CoopFT management or the server owner can run this setup command.", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const result = await services.coopft.bootstrap(interaction.guild, { manual: true, actorId: interaction.user.id });
    return interaction.editReply({
      content: "✅ CoopFT setup checked. Created " + result.createdRoles + " roles, " +
        result.createdChannels + " channels and " + result.createdEmojis + " emojis. Existing resources were reused."
    });
  }
};

const commands = [staffCommand, staffManageCommand, ticketCommand, setupCommand];
function loadCoopFTCommands() {
  const map = new Map();
  for (const command of commands) {
    if (map.has(command.data.name)) throw new Error("Duplicate CoopFT command: " + command.data.name);
    map.set(command.data.name, command);
  }
  return map;
}

module.exports = { loadCoopFTCommands };
