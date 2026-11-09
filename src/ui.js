const { EmbedBuilder, MessageFlags } = require("discord.js");
const settings = require("./config/settings");

function createEmbed(options = {}) {
  const brand = settings.brand;
  const thumbnail = options.thumbnail || options.iconUrl || null;
  const title = options.title ? String(options.title).trim().slice(0, 256) : "";
  const description = options.description ? String(options.description).trim().slice(0, 4096) : "";
  const footerText = options.footer === false
    ? ""
    : String(options.footer ?? "FUKISHOKAI  •  Interactive game centre").slice(0, 2000);
  const embed = new EmbedBuilder()
    .setColor(options.color ?? brand.primary)
    .setAuthor({ name: brand.name });
  if (options.footer !== false) {
    embed.setFooter({ text: footerText });
  }

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);

  if (Array.isArray(options.fields) && options.fields.length) {
    let remaining = 6000 - brand.name.length - footerText.length - title.length - description.length;
    const fields = [];
    for (const field of options.fields.slice(0, 25)) {
      if (remaining < 8) break;
      const name = String(field.name || "Details").slice(0, 256);
      const allowance = Math.max(1, Math.min(1024, remaining - name.length));
      const value = String(field.value || "—").slice(0, allowance);
      fields.push({ name, value, inline: Boolean(field.inline) });
      remaining -= name.length + value.length;
    }
    if (fields.length) embed.addFields(fields);
  }

  if (thumbnail) embed.setThumbnail(thumbnail);
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
  const icon = options.icon || (options.kind === "error" || options.kind === "warning" ? "failed" : null);
  const embed = createEmbed({ ...options, icon, color });
  const payload = { embeds: [embed], flags: options.ephemeral ? MessageFlags.Ephemeral : undefined, components: options.components || [] };
  if (interaction.deferred || interaction.replied) {
    delete payload.flags;
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

module.exports = { createEmbed, respond };
