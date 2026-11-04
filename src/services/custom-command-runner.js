const ivm = require("isolated-vm");

function readInput() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    process.stdin.on("data", (chunk) => {
      size += chunk.length;
      if (size > 128 * 1024) {
        reject(new Error("Command source or input is too large."));
        process.stdin.destroy();
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (_) { reject(new Error("Invalid command runner input.")); }
    });
    process.stdin.on("error", reject);
  });
}

function write(value) {
  process.stdout.write(JSON.stringify(value));
}

function sandboxPrefix() {
  return [
    "const module = { exports: {} };",
    "const exports = module.exports;",
    "class SandboxEmbedBuilder {",
    "  constructor(data = {}) { this.data = { ...data }; }",
    "  setTitle(value) { this.data.title = value; return this; }",
    "  setDescription(value) { this.data.description = value; return this; }",
    "  setColor(value) { this.data.color = value; return this; }",
    "  setURL(value) { this.data.url = value; return this; }",
    "  setTimestamp(value = new Date()) { this.data.timestamp = new Date(value).toISOString(); return this; }",
    "  setFooter(value) { this.data.footer = value; return this; }",
    "  setAuthor(value) { this.data.author = value; return this; }",
    "  setImage(value) { this.data.image = { url: value }; return this; }",
    "  setThumbnail(value) { this.data.thumbnail = { url: value }; return this; }",
    "  addFields(...values) { this.data.fields = (this.data.fields || []).concat(values.flat()); return this; }",
    "  toJSON() { return this.data; }",
    "}",
    "class SandboxSlashOptionBuilder {",
    "  constructor(type) { this.data = { type, required: false }; }",
    "  setName(value) { this.data.name = value; return this; }",
    "  setDescription(value) { this.data.description = value; return this; }",
    "  setRequired(value) { this.data.required = Boolean(value); return this; }",
    "  addChoices(...values) { this.data.choices = (this.data.choices || []).concat(values); return this; }",
    "  setMinLength(value) { this.data.minLength = value; return this; }",
    "  setMaxLength(value) { this.data.maxLength = value; return this; }",
    "  setMinValue(value) { this.data.minValue = value; return this; }",
    "  setMaxValue(value) { this.data.maxValue = value; return this; }",
    "  toJSON() { return this.data; }",
    "}",
    "class SandboxSlashCommandBuilder {",
    "  constructor() { this.data = { options: [] }; this.visibility = 'public'; }",
    "  setName(value) { this.data.name = value; return this; }",
    "  setDescription(value) { this.data.description = value; return this; }",
    "  setVisibility(value) { this.visibility = value; return this; }",
    "  addStringOption(fn) { return this.__addOption('string', fn); }",
    "  addIntegerOption(fn) { return this.__addOption('integer', fn); }",
    "  addNumberOption(fn) { return this.__addOption('number', fn); }",
    "  addBooleanOption(fn) { return this.__addOption('boolean', fn); }",
    "  addUserOption(fn) { return this.__addOption('user', fn); }",
    "  addChannelOption(fn) { return this.__addOption('channel', fn); }",
    "  addRoleOption(fn) { return this.__addOption('role', fn); }",
    "  addMentionableOption(fn) { return this.__addOption('mentionable', fn); }",
    "  __addOption(type, fn) { const option = new SandboxSlashOptionBuilder(type); const configured = fn(option) || option; this.data.options.push(configured.toJSON()); return this; }",
    "  toJSON() { return { ...this.data, options: this.data.options.map((option) => ({ ...option })), visibility: this.visibility }; }",
    "}",
    "const require = (specifier) => {",
    "  if (specifier !== 'discord.js') throw new Error('Only the restricted discord.js builder shim is available in custom commands.');",
    "  return Object.freeze({ EmbedBuilder: SandboxEmbedBuilder, SlashCommandBuilder: SandboxSlashCommandBuilder });",
    "};",
    "const __readOption = (name) => { const options = __input && __input.options || {}; return Object.prototype.hasOwnProperty.call(options, name) ? options[name] : null; };",
    "const __send = (method, payload) => {",
    "  if (typeof payload === 'string') payload = { content: payload };",
    "  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Interaction replies must be response objects.');",
    "  __emit(JSON.stringify({ method, payload }));",
    "  return Promise.resolve();",
    "};",
    "const interaction = Object.freeze({",
    "  id: __input.id || 'custom-command',",
    "  commandName: __input.commandName || null,",
    "  user: __input.user || {},",
    "  member: __input.member || null,",
    "  guild: __input.guild || null,",
    "  guildId: __input.guild && __input.guild.id || null,",
    "  channel: __input.channel || null,",
    "  channelId: __input.channel && __input.channel.id || null,",
    "  client: Object.freeze({ user: __input.clientUser || null }),",
    "  deferred: true,",
    "  replied: false,",
    "  isChatInputCommand: () => true,",
    "  isRepliable: () => true,",
    "  options: Object.freeze({",
    "    get: (name) => { const value = __readOption(name); return value === null ? null : { name, value: value && typeof value === 'object' ? (value.raw || value.id || value.name) : value }; },",
    "    getString: (name) => { const value = __readOption(name); if (value === null) return null; return typeof value === 'object' ? String(value.value === undefined ? (value.name || '') : value.value) : String(value); },",
    "    getInteger: (name) => { const value = __readOption(name); if (value === null) return null; const number = Number(value && typeof value === 'object' ? value.value : value); return Number.isInteger(number) ? number : null; },",
    "    getNumber: (name) => { const value = __readOption(name); if (value === null) return null; const number = Number(value && typeof value === 'object' ? value.value : value); return Number.isFinite(number) ? number : null; },",
    "    getBoolean: (name) => { const value = __readOption(name); if (value === null) return null; const raw = value && typeof value === 'object' ? value.value : value; return typeof raw === 'boolean' ? raw : raw === 'true'; },",
    "    getUser: (name) => { const value = __readOption(name); return value && typeof value === 'object' ? value : null; },",
    "    getMember: (name) => { const value = __readOption(name); return value && typeof value === 'object' ? (value.member || value) : null; },",
    "    getRole: (name) => { const value = __readOption(name); return value && typeof value === 'object' ? value : null; },",
    "    getChannel: (name) => { const value = __readOption(name); return value && typeof value === 'object' ? value : null; },",
    "    getMentionable: (name) => { const value = __readOption(name); return value && typeof value === 'object' ? value : null; }",
    "  }),",
    "  reply: (payload) => __send('reply', payload),",
    "  editReply: (payload) => __send('editReply', payload),",
    "  followUp: (payload) => __send('followUp', payload),",
    "  deferReply: async () => undefined",
    "});"
  ].join("\n");
}

async function main() {
  const request = await readInput();
  if (!request || typeof request.source !== "string" || request.source.length < 1 || request.source.length > 50000) {
    throw new Error("Command source must contain 1–50,000 characters.");
  }

  const isolate = new ivm.Isolate({ memoryLimit: 48 });
  try {
    const context = isolate.createContextSync();
    context.global.setSync("__input", request.input || {}, { copy: true });
    const prefix = sandboxPrefix();

    if (request.mode === "inspect") {
      const script = isolate.compileScriptSync(
        prefix + "\n" + request.source + "\n" +
        "(() => { const data = module.exports.data; const json = data && typeof data.toJSON === 'function' ? data.toJSON() : data; " +
        "return JSON.stringify({ data: json, visibility: data && data.visibility || json && json.visibility || 'public', " +
        "hasExecute: typeof module.exports.execute === 'function' }); })()"
      );
      const output = script.runSync(context, { timeout: 500, copy: true });
      const inspected = typeof output === "string" ? JSON.parse(output) : null;
      if (!inspected || !inspected.data || typeof inspected.data !== "object" || inspected.hasExecute !== true) {
        throw new Error("Your command file must export data metadata and an execute function, for example async execute(interaction).");
      }
      if (inspected.visibility) inspected.data.visibility = inspected.visibility;
      write({ ok: true, data: inspected.data });
      return;
    }

    if (request.mode !== "run") throw new Error("Unknown command runner operation.");
    const emitted = [];
    context.global.setSync("__emit", new ivm.Callback((json) => {
      if (emitted.length >= 10) throw new Error("A command can send at most 10 interaction responses.");
      const call = JSON.parse(String(json));
      if (!call || !["reply", "editReply", "followUp"].includes(call.method) ||
          !call.payload || typeof call.payload !== "object" || Array.isArray(call.payload)) {
        throw new Error("The command attempted an invalid interaction response.");
      }
      emitted.push(call);
      return true;
    }, { sync: true }));

    const initScript = isolate.compileScriptSync(prefix + "\n" + request.source + "\n; true");
    initScript.runSync(context, { timeout: 500, copy: true });
    const inspectScript = isolate.compileScriptSync("typeof module.exports.execute === 'function' ? 'ok' : 'missing'");
    if (inspectScript.runSync(context, { timeout: 100, copy: true }) !== "ok") {
      throw new Error("Your command file must export an execute(interaction) function.");
    }

    let resolveResult;
    const resultPromise = new Promise((resolve) => { resolveResult = resolve; });
    const finish = new ivm.Callback((json) => resolveResult(String(json)), { sync: true });
    context.global.setSync("__finish", finish);
    const runScript = isolate.compileScriptSync(
      "(async () => { try { const result = await module.exports.execute(interaction); " +
      "const serialized = JSON.stringify({ ok: true, result: result === undefined ? null : result }); " +
      "__finish(serialized || '{\"ok\":false,\"error\":\"Unserializable command result\"}'); " +
      "} catch (error) { __finish(JSON.stringify({ ok: false, error: String(error && error.message || error).slice(0, 700) })); } })(); 'started';"
    );
    await runScript.run(context, { timeout: 1200 });
    const serialized = await Promise.race([
      resultPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Command execution timed out after 2 seconds.")), 2000))
    ]);
    const result = JSON.parse(serialized);
    if (!result.ok) throw new Error(result.error || "Command execution failed.");
    write({ ok: true, result: result.result, calls: emitted });
  } finally {
    isolate.dispose();
  }
}

main().catch((error) => {
  write({ ok: false, error: String(error && error.message || error).slice(0, 1000) });
  process.exitCode = 1;
});
