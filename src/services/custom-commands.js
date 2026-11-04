const { randomUUID } = require("node:crypto");
const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");

const RESERVED_NAMES = new Set(["admin", "menu"]);
const OPTION_TYPES = new Set(["string", "integer", "number", "boolean", "user", "channel", "role", "mentionable"]);
const RESPONSE_KEYS = new Set(["visibility", "content", "title", "description", "color", "fields"]);
const OPTION_KEYS = new Set(["name", "description", "type", "required", "choices", "minLength", "maxLength", "minValue", "maxValue"]);
const FIELD_KEYS = new Set(["name", "value", "inline"]);

function fail(message, code = "CUSTOM_COMMAND_INVALID") {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function validText(value, label, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) fail(label + " must contain " + min + "–" + max + " characters.");
  return value.trim();
}
function assertOnlyKeys(value, allowed, label) {
  for (const key of Object.keys(value || {})) if (!allowed.has(key)) fail("Unsupported " + label + " property: " + key + ".");
}
function validateCommandMeta(name, description) {
  const cleanName = validText(name, "Command name", 1, 32);
  if (!/^[a-z0-9_-]+$/.test(cleanName)) fail("Slash command names must be lowercase and use only letters, numbers, hyphens or underscores.");
  if (RESERVED_NAMES.has(cleanName)) fail("That name is reserved by a built-in Fukishōkai command.");
  return { name: cleanName, description: validText(description, "Command description", 1, 100) };
}

function parseDefinition(source) {
  let parsed;
  try { parsed = typeof source === "string" ? JSON.parse(source) : source; }
  catch (_) { fail("The command code is not valid JSON. Check commas, quotation marks and brackets."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("Command code must be a JSON object.");
  assertOnlyKeys(parsed, new Set(["options", "response"]), "command");
  const options = parsed.options === undefined ? [] : parsed.options;
  const response = parsed.response;
  if (!Array.isArray(options) || options.length > 25) fail("A command can have up to 25 options.");
  if (!response || typeof response !== "object" || Array.isArray(response)) fail("Add a response object to the command code.");
  assertOnlyKeys(response, RESPONSE_KEYS, "response");
  const seen = new Set();
  const normalizedOptions = options.map((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) fail("Each option must be an object.");
    assertOnlyKeys(option, OPTION_KEYS, "option");
    const name = validText(option.name, "Option name", 1, 32);
    if (!/^[a-z0-9_-]+$/.test(name)) fail("Option names must use lowercase letters, numbers, hyphens or underscores.");
    if (seen.has(name)) fail("Option names must be unique.");
    seen.add(name);
    if (!OPTION_TYPES.has(option.type)) fail("Unsupported option type for " + name + ".");
    const result = { name, description: validText(option.description, "Option description", 1, 100), type: option.type, required: option.required === true };
    if (option.choices !== undefined) {
      if (!Array.isArray(option.choices) || option.choices.length < 1 || option.choices.length > 25) fail("Choices must contain 1–25 entries.");
      if (!["string", "integer", "number"].includes(option.type)) fail("Choices are supported only for string, integer and number options.");
      result.choices = option.choices.map((choice) => {
        if (!choice || typeof choice !== "object" || Array.isArray(choice)) fail("Each choice needs a name and value.");
        const valueTypeValid = option.type === "string" ? typeof choice.value === "string"
          : typeof choice.value === "number" && Number.isFinite(choice.value);
        if (!valueTypeValid) fail("Choice values must match the option type for " + name + ".");
        return { name: validText(choice.name, "Choice name", 1, 100), value: choice.value };
      });
    }
    for (const key of ["minLength", "maxLength", "minValue", "maxValue"]) {
      if (option[key] !== undefined) {
        if (typeof option[key] !== "number" || !Number.isFinite(option[key])) fail(key + " must be a number.");
        result[key] = option[key];
      }
    }
    if ((result.minLength !== undefined || result.maxLength !== undefined) && option.type !== "string") fail("Text length limits are only valid for string options.");
    if (result.minLength !== undefined && (result.minLength < 0 || result.minLength > 6000)) fail("minLength must be between 0 and 6000.");
    if (result.maxLength !== undefined && (result.maxLength < 1 || result.maxLength > 6000)) fail("maxLength must be between 1 and 6000.");
    if (result.minLength !== undefined && result.maxLength !== undefined && result.minLength > result.maxLength) fail("minLength cannot exceed maxLength.");
    if ((result.minValue !== undefined || result.maxValue !== undefined) && !["integer", "number"].includes(option.type)) fail("Numeric limits require an integer or number option.");
    if (result.minValue !== undefined && result.maxValue !== undefined && result.minValue > result.maxValue) fail("minValue cannot exceed maxValue.");
    return result;
  });

  const visibility = response.visibility === undefined ? "public" : response.visibility;
  if (!["public", "private"].includes(visibility)) fail("Response visibility must be public or private.");
  const output = { visibility };
  if (response.content !== undefined) output.content = validText(response.content, "Response content", 1, 2000);
  if (response.title !== undefined) output.title = validText(response.title, "Embed title", 1, 256);
  if (response.description !== undefined) output.description = validText(response.description, "Embed description", 1, 4096);
  if (response.color !== undefined) {
    if (typeof response.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(response.color)) fail("Embed color must look like #C0392B.");
    output.color = response.color;
  }
  if (response.fields !== undefined) {
    if (!Array.isArray(response.fields) || response.fields.length > 25) fail("An embed can contain up to 25 fields.");
    output.fields = response.fields.map((field) => {
      if (!field || typeof field !== "object" || Array.isArray(field)) fail("Each embed field must be an object.");
      assertOnlyKeys(field, FIELD_KEYS, "embed field");
      return {
        name: validText(field.name, "Embed field name", 1, 256),
        value: validText(field.value, "Embed field value", 1, 1024),
        inline: field.inline === true
      };
    });
  }
  if (!output.content && !output.title && !output.description && !output.fields?.length) fail("Add response content or at least one embed field.");
  const total = (output.title || "").length + (output.description || "").length +
    (output.fields || []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);
  if (total > 6000) fail("Combined embed text cannot exceed 6,000 characters.");
  return { options: normalizedOptions, response: output };
}

function toApplicationCommand(record) {
  const meta = validateCommandMeta(record.name, record.description);
  const definition = parseDefinition(record.definition);
  const builder = new SlashCommandBuilder().setName(meta.name).setDescription(meta.description);
  const methods = {
    string: "addStringOption", integer: "addIntegerOption", number: "addNumberOption",
    boolean: "addBooleanOption", user: "addUserOption", channel: "addChannelOption",
    role: "addRoleOption", mentionable: "addMentionableOption"
  };
  for (const option of definition.options) {
    builder[methods[option.type]]((input) => {
      input.setName(option.name).setDescription(option.description).setRequired(option.required);
      if (option.choices) input.addChoices(...option.choices);
      if (option.minLength !== undefined) input.setMinLength(option.minLength);
      if (option.maxLength !== undefined) input.setMaxLength(option.maxLength);
      if (option.minValue !== undefined) input.setMinValue(option.minValue);
      if (option.maxValue !== undefined) input.setMaxValue(option.maxValue);
      return input;
    });
  }
  return builder.toJSON();
}

function selectedOption(interaction, option) {
  const selected = interaction.options.get(option.name, false);
  if (!selected) return null;
  if (option.type === "user") {
    const user = selected.user;
    return user ? { raw: "<@" + user.id + ">", mention: "<@" + user.id + ">", id: user.id, username: user.username, name: user.globalName || user.username } : null;
  }
  if (option.type === "role") {
    const role = selected.role;
    return role ? { raw: "<@&" + role.id + ">", mention: "<@&" + role.id + ">", id: role.id, name: role.name } : null;
  }
  if (option.type === "channel") {
    const channel = selected.channel;
    return channel ? { raw: "<#" + channel.id + ">", mention: "<#" + channel.id + ">", id: channel.id, name: channel.name } : null;
  }
  if (option.type === "mentionable") {
    const value = selected.member?.user || selected.user || selected.role;
    if (!value) return null;
    const isRole = Boolean(value.permissions);
    const mention = isRole ? "<@&" + value.id + ">" : "<@" + value.id + ">";
    return { raw: mention, mention, id: value.id, username: value.username || value.name, name: value.name || value.username };
  }
  return { raw: String(selected.value), name: String(selected.value) };
}

function interpolate(text, interaction, definition) {
  const values = new Map(definition.options.map((option) => [option.name, selectedOption(interaction, option)]));
  return String(text).replace(/\{(user|username|server|channel|option\.([a-z0-9_-]+)(?:\.(username|mention|id|name))?)\}/g, (whole, key, optionName, property) => {
    if (key === "user") return "<@" + interaction.user.id + ">";
    if (key === "username") return interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
    if (key === "server") return interaction.guild?.name || "the server";
    if (key === "channel") return "<#" + interaction.channelId + ">";
    const selected = values.get(optionName);
    return selected ? String(selected[property || "raw"] ?? selected.raw ?? "—") : "—";
  });
}

function buildReply(interaction, definition) {
  const response = definition.response;
  const payload = { allowedMentions: { parse: [] } };
  if (response.content) payload.content = interpolate(response.content, interaction, definition).slice(0, 2000);
  if (response.title || response.description || response.fields?.length) {
    const embed = new EmbedBuilder().setColor(response.color || "#8B1E3F").setTimestamp(new Date());
    if (response.title) embed.setTitle(interpolate(response.title, interaction, definition).slice(0, 256));
    if (response.description) embed.setDescription(interpolate(response.description, interaction, definition).slice(0, 4096));
    if (response.fields?.length) embed.addFields(response.fields.map((field) => ({
      name: (interpolate(field.name, interaction, definition).slice(0, 256) || "Details"),
      value: (interpolate(field.value, interaction, definition).slice(0, 1024) || "—"),
      inline: field.inline
    })));
    payload.embeds = [embed];
  }
  return payload;
}


class CustomCommandService {
  constructor(pool) {
    this.pool = pool;
  }

  async list(guildId) {
    const result = await this.pool.query(
      "SELECT id, name, description, definition, is_active, deployed_at, created_at, updated_at " +
      "FROM custom_commands WHERE guild_id = $1 AND deleted_at IS NULL ORDER BY name ASC",
      [guildId]
    );
    return result.rows;
  }

  async get(guildId, id) {
    const result = await this.pool.query(
      "SELECT id, name, description, definition, is_active, deployed_at FROM custom_commands " +
      "WHERE guild_id = $1 AND id = $2 AND deleted_at IS NULL",
      [guildId, id]
    );
    return result.rows[0] || null;
  }

  async getByName(guildId, name) {
    const result = await this.pool.query(
      "SELECT id, name, description, definition, is_active, deployed_at FROM custom_commands " +
      "WHERE guild_id = $1 AND name = $2 AND deleted_at IS NULL",
      [guildId, name]
    );
    return result.rows[0] || null;
  }

  async save(guildId, actorId, input) {
    const meta = validateCommandMeta(input.name, input.description);
    const definition = parseDefinition(input.code);
    const id = input.id || randomUUID();
    if (input.id) {
      const result = await this.pool.query(
        "UPDATE custom_commands SET name = $3, description = $4, definition = $5::jsonb, is_active = FALSE, " +
        "deployed_at = NULL, updated_by = $6, updated_at = NOW() " +
        "WHERE guild_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id, name, description, definition, is_active, deployed_at",
        [guildId, id, meta.name, meta.description, JSON.stringify(definition), actorId]
      );
      if (!result.rowCount) fail("That custom command no longer exists.", "CUSTOM_COMMAND_NOT_FOUND");
      return result.rows[0];
    }
    const result = await this.pool.query(
      "INSERT INTO custom_commands (id, guild_id, name, description, definition, is_active, created_by, updated_by) " +
      "VALUES ($1, $2, $3, $4, $5::jsonb, FALSE, $6, $6) " +
      "RETURNING id, name, description, definition, is_active, deployed_at",
      [id, guildId, meta.name, meta.description, JSON.stringify(definition), actorId]
    );
    return result.rows[0];
  }

  async activate(guildId, id, actorId) {
    const result = await this.pool.query(
      "UPDATE custom_commands SET is_active = TRUE, updated_by = $3, updated_at = NOW() " +
      "WHERE guild_id = $1 AND id = $2 AND deleted_at IS NULL AND deployed_at IS NOT NULL " +
      "RETURNING id, name, is_active",
      [guildId, id, actorId]
    );
    if (!result.rowCount) fail("Deploy slash commands first, then activate this command.", "CUSTOM_COMMAND_NOT_DEPLOYED");
    return result.rows[0];
  }

  async deactivate(guildId, id, actorId) {
    const result = await this.pool.query(
      "UPDATE custom_commands SET is_active = FALSE, updated_by = $3, updated_at = NOW() " +
      "WHERE guild_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id, name",
      [guildId, id, actorId]
    );
    if (!result.rowCount) fail("That custom command no longer exists.", "CUSTOM_COMMAND_NOT_FOUND");
    return result.rows[0];
  }

  async remove(guildId, id, actorId) {
    const result = await this.pool.query(
      "UPDATE custom_commands SET is_active = FALSE, deleted_at = NOW(), updated_by = $3, updated_at = NOW() " +
      "WHERE guild_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id, name",
      [guildId, id, actorId]
    );
    if (!result.rowCount) fail("That custom command no longer exists.", "CUSTOM_COMMAND_NOT_FOUND");
    return result.rows[0];
  }

  async execute(interaction, record) {
    const definition = parseDefinition(record.definition);
    return interaction.editReply(buildReply(interaction, definition));
  }
}

module.exports = {
  CustomCommandService,
  parseDefinition,
  validateCommandMeta,
  toApplicationCommand,
  buildReply
};
