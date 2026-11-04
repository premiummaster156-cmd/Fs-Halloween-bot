const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectCommandSource, runInIsolatedProcess, toApplicationCommand } = require("../src/services/custom-commands");

const commandSource = String.raw`const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("workspace_hello")
    .setDescription("Send a hello message")
    .addStringOption(option => option
      .setName("name")
      .setDescription("Name to greet")
      .setRequired(false)),

  async execute(interaction) {
    const name = interaction.options.getString("name") || interaction.user.username;
    const embed = new EmbedBuilder()
      .setTitle("Hello")
      .setDescription("Hello, " + name + "!")
      .setColor("#B46A86");
    await interaction.reply({ embeds: [embed] });
  }
};`;

test("JavaScript modules expose slash command metadata through SlashCommandBuilder", async () => {
  const metadata = await inspectCommandSource(commandSource);
  assert.equal(metadata.name, "workspace_hello");
  assert.equal(metadata.description, "Send a hello message");
  assert.equal(metadata.definition.options[0].name, "name");
  assert.equal(metadata.definition.options[0].type, "string");
});

test("JavaScript command receives an interaction facade and can reply with an embed", async () => {
  const execution = await runInIsolatedProcess(commandSource, "run", {
    commandName: "workspace_hello",
    user: { id: "123", username: "tester", displayName: "Tester", mention: "<@123>" },
    member: { id: "123", displayName: "Tester" },
    guild: { id: "456", name: "Fukishokai" },
    channel: { id: "789", name: "general", mention: "<#789>" },
    options: { name: "Ari" }
  });

  assert.equal(execution.calls.length, 1);
  assert.equal(execution.calls[0].method, "reply");
  assert.equal(execution.calls[0].payload.embeds[0].title, "Hello");
  assert.equal(execution.calls[0].payload.embeds[0].description, "Hello, Ari!");
  assert.equal(execution.result, null);
});

test("custom JavaScript cannot access Node process or arbitrary modules", async () => {
  const isolatedSource = String.raw`module.exports = {
  data: { name: "sandbox_check", description: "Check isolation" },
  async execute() {
    let blocked = false;
    try { require("node:fs"); } catch (_) { blocked = true; }
    return {
      content: "process=" + typeof process +
        "; fetch=" + typeof fetch +
        "; arbitraryRequireBlocked=" + blocked
    };
  }
};`;
  const execution = await runInIsolatedProcess(isolatedSource, "run", {});
  assert.match(execution.result.content, /process=undefined/);
  assert.match(execution.result.content, /fetch=undefined/);
  assert.match(execution.result.content, /arbitraryRequireBlocked=true/);
});


test("JavaScript command metadata can be registered as a Discord slash command", async () => {
  const metadata = await inspectCommandSource(commandSource);
  const registered = toApplicationCommand({
    name: metadata.name,
    description: metadata.description,
    definition: metadata.definition,
    source_code: commandSource
  });

  assert.equal(registered.name, "workspace_hello");
  assert.equal(registered.description, "Send a hello message");
  assert.equal(registered.options.length, 1);
  assert.equal(registered.options[0].name, "name");
  assert.equal(registered.options[0].type, 3);
});

test("legacy JSON commands still require a valid response definition", () => {
  assert.throws(() => toApplicationCommand({
    name: "legacy_hello",
    description: "Legacy hello",
    definition: { options: [], response: { visibility: "public" } }
  }), /Add response content/);

  const registered = toApplicationCommand({
    name: "legacy_hello",
    description: "Legacy hello",
    definition: { options: [], response: { visibility: "public", content: "Hello" } }
  });
  assert.equal(registered.name, "legacy_hello");
});

test("editing a workspace JavaScript file is picked up by the next command invocation without a bot restart", async () => {
  const { CustomCommandService } = require("../src/services/custom-commands");
  const workspace = require("../src/services/admin-workspace");
  const originalRead = workspace.readCommandFile;
  let activeSource = String.raw`module.exports = {
  data: { name: "live_reload", description: "Test live command reload" },
  async execute(interaction) {
    await interaction.reply({ content: "version one" });
  }
};`;
  workspace.readCommandFile = async () => activeSource;
  const service = new CustomCommandService({});
  const record = {
    name: "live_reload",
    source_code: activeSource,
    definition: { options: [], response: { visibility: "public" } }
  };
  const createInteraction = () => {
    const replies = [];
    return {
      replies,
      id: "interaction-id",
      commandName: "live_reload",
      user: { id: "user-1", username: "Tester", globalName: "Tester" },
      member: { displayName: "Tester" },
      guildId: "guild-1",
      guild: { name: "Fukishokai", ownerId: "owner-1" },
      channelId: "channel-1",
      channel: { name: "game" },
      client: { user: { id: "bot-1", username: "Bot", tag: "Bot#0001" } },
      options: { get: () => null },
      editReply: async (payload) => replies.push(payload),
      followUp: async (payload) => replies.push(payload)
    };
  };

  try {
    const first = createInteraction();
    await service.execute(first, record);
    assert.equal(first.replies[0].content, "version one");

    activeSource = String.raw`module.exports = {
  data: { name: "live_reload", description: "Test live command reload" },
  async execute(interaction) {
    await interaction.reply({ content: "version two - edited" });
  }
};`;
    const second = createInteraction();
    await service.execute(second, record);
    assert.equal(second.replies[0].content, "version two - edited");
  } finally {
    workspace.readCommandFile = originalRead;
  }
});
