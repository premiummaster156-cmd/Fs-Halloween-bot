const test = require("node:test");
const assert = require("node:assert/strict");
const { isBrowserIdeEnabled, isIdeServerEnabled } = require("../src/web/ide-server");

test("AI workspace API can start without browser OAuth configuration", () => {
  const config = {
    ideGuildId: "123456789012345678",
    adminWorkspaceApiKey: "a".repeat(48),
    discordClientSecret: "",
    idePublicUrl: ""
  };

  assert.equal(isBrowserIdeEnabled(config), false);
  assert.equal(isIdeServerEnabled(config), true);
});

test("browser Code Studio needs OAuth settings but selects its guild from the admin-panel link", () => {
  const config = {
    ideGuildId: "123456789012345678",
    adminWorkspaceApiKey: "",
    discordClientSecret: "discord-client-secret",
    idePublicUrl: "https://studio.example.com"
  };

  assert.equal(isBrowserIdeEnabled(config), true);
  assert.equal(isIdeServerEnabled(config), true);
});

test("workspace server stays disabled without a guild and a supported feature", () => {
  assert.equal(isIdeServerEnabled({
    ideGuildId: "",
    adminWorkspaceApiKey: "a".repeat(48),
    discordClientSecret: "",
    idePublicUrl: ""
  }), false);
  assert.equal(isIdeServerEnabled({
    ideGuildId: "123456789012345678",
    adminWorkspaceApiKey: "",
    discordClientSecret: "",
    idePublicUrl: ""
  }), false);
});
test("browser Code Studio can serve multiple servers without a fixed IDE_GUILD_ID", () => {
  const config = {
    ideGuildId: "",
    adminWorkspaceApiKey: "",
    discordClientSecret: "discord-client-secret",
    idePublicUrl: "https://studio.example.com"
  };
  assert.equal(isBrowserIdeEnabled(config), true);
  assert.equal(isIdeServerEnabled(config), true);
});
