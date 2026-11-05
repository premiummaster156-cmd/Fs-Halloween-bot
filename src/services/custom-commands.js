const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const { EmbedBuilder, SlashCommandBuilder, REST, Routes } = require("discord.js");
const settings = require("../config/settings");
const workspace = require("./admin-workspace");

const RESERVED_NAMES = new Set(["admin", "menu", "play", "roast", "fortune"]);
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
  let definition;
  if (record.source_code) {
    let sourceDefinition = record.definition;
    if (typeof sourceDefinition === "string") {
      try { sourceDefinition = JSON.parse(sourceDefinition); }
      catch (_) { fail("Stored JavaScript command metadata is invalid."); }
    }
    if (!sourceDefinition || typeof sourceDefinition !== "object" || Array.isArray(sourceDefinition)) {
      fail("Stored JavaScript command metadata is invalid.");
    }
    const response = sourceDefinition.response;
    if (response !== undefined && (!response || typeof response !== "object" || Array.isArray(response))) {
      fail("Stored JavaScript command response metadata is invalid.");
    }
    const responseMetadata = response || {};
    const hasResponseBody = Boolean(
      responseMetadata.content || responseMetadata.title || responseMetadata.description ||
      (Array.isArray(responseMetadata.fields) && responseMetadata.fields.length)
    );
    definition = parseDefinition({
      options: sourceDefinition.options || [],
      response: hasResponseBody
        ? responseMetadata
        : { ...responseMetadata, content: "This command responds through its JavaScript execute function." }
    });
  } else {
    definition = parseDefinition(record.definition);
  }
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



function runInIsolatedProcess(source, mode, input = {}) {
  return new Promise((resolve, reject) => {
    const runner = path.join(__dirname, "custom-command-runner.js");
    const child = spawn(process.execPath, ["--no-node-snapshot", runner], {
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH || "", SYSTEMROOT: process.env.SYSTEMROOT || "" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("The command runner exceeded its time limit."));
    }, 4000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 65536) {
        child.kill("SIGKILL");
        finish(new Error("Command output exceeded the size limit."));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-4000);
    });
    child.on("error", (error) => finish(new Error("Could not start the isolated JavaScript runner: " + error.message)));
    child.on("close", (code) => {
      if (settled) return;
      let result;
      try { result = JSON.parse(stdout); }
      catch (_) { return finish(new Error("The JavaScript runner returned an invalid result. " + stderr.slice(-500))); }
      if (code !== 0 || !result.ok) return finish(new Error(result.error || "JavaScript command execution failed."));
      finish(null, result);
    });
    child.stdin.end(JSON.stringify({ source, mode, input }));
  });
}

function inspectCommandSource(source) {
  if (typeof source !== "string" || source.trim().length < 1 || source.length > 50000) {
    fail("JavaScript source must contain 1–50,000 characters.");
  }
  return runInIsolatedProcess(source, "inspect").then((result) => {
    const data = result.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) fail("Your file must export a data object.");
    const meta = validateCommandMeta(data.name, data.description);
    const visibility = data.visibility === undefined ? "public" : data.visibility;
    const definition = parseDefinition({
      options: data.options === undefined ? [] : data.options,
      response: { visibility, content: "This command uses its JavaScript execute function." }
    });
    return {
      name: meta.name,
      description: meta.description,
      definition: { options: definition.options, response: { visibility } }
    };
  });
}

function customCommandInput(interaction, definition) {
  const options = {};
  for (const option of definition.options || []) {
    const selected = selectedOption(interaction, option);
    if (!selected) {
      options[option.name] = null;
    } else if (["user", "role", "channel", "mentionable"].includes(option.type)) {
      options[option.name] = selected;
    } else {
      options[option.name] = selected.raw;
    }
  }
  return {
    id: interaction.id || null,
    commandName: interaction.commandName,
    user: {
      id: interaction.user.id,
      username: interaction.user.username,
      globalName: interaction.user.globalName || null,
      displayName: interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
      mention: "<@" + interaction.user.id + ">"
    },
    member: {
      id: interaction.user.id,
      displayName: interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
      user: {
        id: interaction.user.id,
        username: interaction.user.username,
        globalName: interaction.user.globalName || null
      }
    },
    guild: { id: interaction.guildId, name: interaction.guild?.name || "Server", ownerId: interaction.guild?.ownerId || null },
    channel: { id: interaction.channelId, name: interaction.channel?.name || "channel", mention: "<#" + interaction.channelId + ">" },
    clientUser: interaction.client?.user ? {
      id: interaction.client.user.id,
      username: interaction.client.user.username,
      tag: interaction.client.user.tag || null
    } : null,
    options
  };
}

function normalizeCustomReply(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    fail("Your execute function must return a response object.", "CUSTOM_COMMAND_OUTPUT_INVALID");
  }
  const allowed = new Set(["content", "embeds"]);
  assertOnlyKeys(result, allowed, "response");
  const payload = { allowedMentions: { parse: [] } };
  if (result.content !== undefined) {
    if (typeof result.content !== "string" || result.content.length > 2000) {
      fail("Response content must be text under 2,000 characters.", "CUSTOM_COMMAND_OUTPUT_INVALID");
    }
    payload.content = result.content;
  }
  if (result.embeds !== undefined) {
    if (!Array.isArray(result.embeds) || result.embeds.length > 10) {
      fail("Return up to 10 embeds.", "CUSTOM_COMMAND_OUTPUT_INVALID");
    }
    payload.embeds = result.embeds.map((source) => {
      if (!source || typeof source !== "object" || Array.isArray(source)) fail("Each embed must be an object.");
      assertOnlyKeys(source, new Set(["title", "description", "color", "fields", "footer", "author", "url", "timestamp", "image", "thumbnail"]), "embed");
      const embed = new EmbedBuilder().setTimestamp(new Date());
      if (source.title !== undefined) embed.setTitle(validText(source.title, "Embed title", 1, 256));
      if (source.description !== undefined) embed.setDescription(validText(source.description, "Embed description", 1, 4096));
      if (source.timestamp !== undefined) {
        const timestamp = new Date(source.timestamp);
        if (!Number.isFinite(timestamp.getTime())) fail("Embed timestamp must be a valid date.");
        embed.setTimestamp(timestamp);
      }
      for (const property of ["image", "thumbnail"]) {
        if (source[property] !== undefined) {
          const image = typeof source[property] === "string" ? source[property] : source[property]?.url;
          const clean = validText(image, "Embed " + property + " URL", 1, 2048);
          if (!/^https:\/\//i.test(clean)) fail("Embed image URLs must use HTTPS.");
          if (property === "image") embed.setImage(clean);
          else embed.setThumbnail(clean);
        }
      }
      if (source.url !== undefined) {
        const url = validText(source.url, "Embed URL", 1, 2048);
        if (!/^https:\/\//i.test(url)) fail("Embed URLs must use HTTPS.");
        embed.setURL(url);
      }
      if (source.color !== undefined) {
        const color = typeof source.color === "string" && /^#[0-9a-fA-F]{6}$/.test(source.color)
          ? Number.parseInt(source.color.slice(1), 16) : source.color;
        if (!Number.isInteger(color) || color < 0 || color > 0xFFFFFF) fail("Embed color must be a hex color or an integer.");
        embed.setColor(color);
      }
      if (source.author !== undefined) {
        if (!source.author || typeof source.author !== "object") fail("Embed author must be an object.");
        assertOnlyKeys(source.author, new Set(["name", "url"]), "embed author");
        const author = { name: validText(source.author.name, "Author name", 1, 256) };
        if (source.author.url) {
          if (!/^https:\/\//i.test(source.author.url)) fail("Author URLs must use HTTPS.");
          author.url = source.author.url;
        }
        embed.setAuthor(author);
      }
      if (source.footer !== undefined) {
        if (!source.footer || typeof source.footer !== "object") fail("Embed footer must be an object.");
        assertOnlyKeys(source.footer, new Set(["text"]), "embed footer");
        embed.setFooter({ text: validText(source.footer.text, "Footer", 1, 2048) });
      }
      if (source.fields !== undefined) {
        if (!Array.isArray(source.fields) || source.fields.length > 25) fail("An embed can contain up to 25 fields.");
        embed.addFields(source.fields.map((field) => {
          if (!field || typeof field !== "object") fail("Each embed field must be an object.");
          assertOnlyKeys(field, new Set(["name", "value", "inline"]), "embed field");
          return {
            name: validText(field.name, "Field name", 1, 256),
            value: validText(field.value, "Field value", 1, 1024),
            inline: field.inline === true
          };
        }));
      }
      return embed;
    });
  }
  if (!payload.content && !payload.embeds?.length) fail("Return content or at least one embed.", "CUSTOM_COMMAND_OUTPUT_INVALID");
  return payload;
}

class CustomCommandService {
  constructor(pool) {
    this.pool = pool;
  }

  async list(guildId) {
    const result = await this.pool.query(
      "SELECT id, name, description, definition, source_code, is_active, deployed_at, created_at, updated_at " +
      "FROM custom_commands WHERE guild_id = $1 AND deleted_at IS NULL ORDER BY name ASC",
      [guildId]
    );
    return result.rows;
  }

  async get(guildId, id) {
    const result = await this.pool.query(
      "SELECT id, name, description, definition, source_code, is_active, deployed_at FROM custom_commands " +
      "WHERE guild_id = $1 AND id = $2 AND deleted_at IS NULL",
      [guildId, id]
    );
    return result.rows[0] || null;
  }

  async getByName(guildId, name) {
    const result = await this.pool.query(
      "SELECT id, name, description, definition, source_code, is_active, deployed_at FROM custom_commands " +
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

  async saveSource(guildId, actorId, input) {
    const inspected = await inspectCommandSource(input.sourceCode);
    const existing = input.id
      ? await this.get(guildId, input.id)
      : await this.getByName(guildId, inspected.name);
    if (input.id && !existing) fail("That custom command no longer exists.", "CUSTOM_COMMAND_NOT_FOUND");
    const id = existing?.id || input.id || randomUUID();
    const previousSource = existing
      ? await workspace.readCommandFile(guildId, existing.name).catch(() => null)
      : null;

    await workspace.writeCommandFile(guildId, inspected.name, input.sourceCode);
    try {
      let result;
      if (existing) {
        result = await this.pool.query(
          "UPDATE custom_commands SET name = $3, description = $4, definition = $5::jsonb, source_code = $6, " +
          "is_active = FALSE, deployed_at = NULL, updated_by = $7, updated_at = NOW() " +
          "WHERE guild_id = $1 AND id = $2 AND deleted_at IS NULL " +
          "RETURNING id, name, description, definition, source_code, is_active, deployed_at",
          [guildId, id, inspected.name, inspected.description, JSON.stringify(inspected.definition), input.sourceCode, actorId]
        );
        if (!result.rowCount) fail("That custom command no longer exists.", "CUSTOM_COMMAND_NOT_FOUND");
      } else {
        result = await this.pool.query(
          "INSERT INTO custom_commands (id, guild_id, name, description, definition, source_code, is_active, created_by, updated_by) " +
          "VALUES ($1, $2, $3, $4, $5::jsonb, $6, FALSE, $7, $7) " +
          "RETURNING id, name, description, definition, source_code, is_active, deployed_at",
          [id, guildId, inspected.name, inspected.description, JSON.stringify(inspected.definition), input.sourceCode, actorId]
        );
      }
      if (existing && existing.name !== inspected.name) {
        await workspace.deleteCommandFile(guildId, existing.name).catch(() => {});
      }
      return result.rows[0];
    } catch (error) {
      if (previousSource !== null) {
        await workspace.writeCommandFile(guildId, existing.name, previousSource).catch(() => {});
      } else if (!existing) {
        await workspace.deleteCommandFile(guildId, inspected.name).catch(() => {});
      }
      throw error;
    }
  }

  async restoreWorkspaceFiles() {
    const result = await this.pool.query(
      "SELECT guild_id, name, source_code FROM custom_commands " +
      "WHERE source_code IS NOT NULL AND deleted_at IS NULL"
    );
    for (const row of result.rows) {
      await workspace.writeCommandFile(row.guild_id, row.name, row.source_code);
    }
    return result.rowCount;
  }

  async deployGuild(guildId) {
    if (!settings.discordToken || !settings.clientId) {
      fail("DISCORD_TOKEN and CLIENT_ID are required to register slash commands.", "CUSTOM_COMMAND_DEPLOY_CONFIG");
    }
    if (!/^\d{1,25}$/.test(String(guildId || ""))) fail("A valid server ID is required.");
    const builtIn = Array.from(require("../commands").loadCommands().values())
      .map((command) => command.data.toJSON());
    const rows = await this.list(guildId);
    const names = new Set(builtIn.map((command) => command.name));
    const commands = builtIn.slice();
    for (const record of rows) {
      const command = toApplicationCommand(record);
      if (names.has(command.name)) fail("Custom command name conflicts with an existing command: /" + command.name);
      names.add(command.name);
      commands.push(command);
    }
    const rest = new REST({ version: "10" }).setToken(settings.discordToken);
    await rest.put(Routes.applicationGuildCommands(settings.clientId, guildId), { body: commands });
    await this.pool.query(
      "UPDATE custom_commands SET deployed_at = NOW(), updated_at = NOW() " +
      "WHERE guild_id = $1 AND deleted_at IS NULL",
      [guildId]
    );
    return { registeredCount: commands.length, customCount: rows.length };
  }

  async publishSource(guildId, actorId, input) {
    const saved = await this.saveSource(guildId, actorId, input);
    const deployment = await this.deployGuild(guildId);
    const activated = await this.activate(guildId, saved.id, actorId);
    return { ...saved, is_active: true, deployed_at: new Date().toISOString(), deployment, activated };
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
    await workspace.deleteCommandFile(guildId, result.rows[0].name).catch(() => {});
    return result.rows[0];
  }

  async execute(interaction, record) {
    const definition = record.definition && record.definition.response
      ? record.definition
      : parseDefinition(record.definition);
    if (!record.source_code) {
      return interaction.editReply(buildReply(interaction, definition));
    }

    const sourceCode = await workspace.readCommandFile(interaction.guildId, record.name)
      .catch(() => record.source_code);
    const execution = await runInIsolatedProcess(sourceCode || record.source_code, "run", customCommandInput(interaction, definition));
    let hasReplied = false;

    for (const call of execution.calls || []) {
      const payload = normalizeCustomReply(call.payload);
      if (call.method === "reply") {
        if (hasReplied) await interaction.followUp(payload);
        else await interaction.editReply(payload);
        hasReplied = true;
      } else if (call.method === "editReply") {
        await interaction.editReply(payload);
        hasReplied = true;
      } else if (call.method === "followUp") {
        await interaction.followUp(payload);
        hasReplied = true;
      }
    }

    if (execution.result !== null && execution.result !== undefined) {
      const payload = normalizeCustomReply(execution.result);
      if (hasReplied) await interaction.followUp(payload);
      else await interaction.editReply(payload);
      hasReplied = true;
    }
    if (!hasReplied) fail("The command must call interaction.reply(), interaction.editReply(), or return a response object.", "CUSTOM_COMMAND_OUTPUT_INVALID");
  }

  async previewSource(sourceCode, input) {
    await inspectCommandSource(sourceCode);
    const execution = await runInIsolatedProcess(sourceCode, "run", input);
    const firstReply = (execution.calls || []).find((call) => call && ["reply", "editReply", "followUp"].includes(call.method));
    const output = execution.result !== null && execution.result !== undefined ? execution.result : firstReply?.payload;
    return normalizeCustomReply(output);
  }
}

module.exports = {
  CustomCommandService,
  parseDefinition,
  validateCommandMeta,
  toApplicationCommand,
  buildReply,
  inspectCommandSource,
  runInIsolatedProcess,
  normalizeCustomReply
};
