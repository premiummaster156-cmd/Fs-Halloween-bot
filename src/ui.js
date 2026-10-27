const { EmbedBuilder } = require("discord.js");
const settings = require("./config/settings");

function createEmbed(options = {}) {
  const brand = settings.brand;
  const embed = new EmbedBuilder()
    .setColor(options.color || brand.primary)
    .setAuthor({ name: brand.emoji + " " + brand.name })
    .setFooter({ text: options.footer || "Fukishokai • " + brand.name });
  if (options.title) embed.setTitle(String(options.title).slice(0, 256));
  if (options.description) embed.setDescription(String(options.description).slice(0, 4096));
  if (Array.isArray(options.fields) && options.fields.length) {
    embed.addFields(options.fields.slice(0, 25).map((field) => ({
      name: String(field.name || "Details").slice(0, 256),
      value: String(field.value || "—").slice(0, 1024),
      inline: Boolean(field.inline)
    })));
  }
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);
  if (options.timestamp !== false) embed.setTimestamp();
  return embed;
}
const colors = {
  info: () => settings.brand.primary,
  success: () => settings.brand.success,
  warning: () => settings.brand.warning,
  error: () => settings.brand.danger,
  neutral: () => settings.brand.neutral
};
async function respond(interaction, options = {}) {
  const color = colors[options.kind] ? colors[options.kind]() : colors.info();
  const embed = createEmbed({ ...options, color });
  const payload = { embeds: [embed], ephemeral: Boolean(options.ephemeral) };
  if (interaction.deferred || interaction.replied) {
    delete payload.ephemeral;
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}
module.exports = { createEmbed, respond };
