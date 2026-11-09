const test = require("node:test");
const assert = require("node:assert/strict");
const { isBrowserIdeEnabled, isIdeServerEnabled, authoriseMember } = require("../src/web/ide-server");
const settings = require("../src/config/settings");
const { randomUUID } = require("node:crypto");

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

test("Code Studio checks the trusted Admin Role in the exact server selected by the admin-panel link", async () => {
  const userId = "workspace-admin-" + randomUUID();
  const guilds = new Map();
  const roleByGuild = {
    "123456789012345671": "trusted-role-a",
    "123456789012345672": "trusted-role-b"
  };
  for (const guildId of Object.keys(roleByGuild)) {
    guilds.set(guildId, {
      id: guildId,
      name: "Server " + guildId,
      ownerId: "owner-" + guildId,
      members: {
        fetch: async () => ({
          roles: { cache: { has: (roleId) => guildId.endsWith("671") && roleId === roleByGuild[guildId] } }
        })
      }
    });
  }
  const client = {
    guilds: {
      cache: { get: (guildId) => guilds.get(guildId) },
      fetch: async (guildId) => guilds.get(guildId)
    }
  };
  const services = {
    guildSettings: {
      get: async (guildId, key) => key === "adminRoleId" ? roleByGuild[guildId] : null
    }
  };

  const access = await authoriseMember(client, services, userId, "123456789012345671");
  assert.equal(access.guild.id, "123456789012345671");
  await assert.rejects(
    authoriseMember(client, services, userId, "123456789012345672"),
    /limited to this server/
  );
  await assert.rejects(
    authoriseMember(client, services, userId, "../other"),
    /server ID/
  );
});


test("AI workspace bearer-key API uses its configured server without requiring a browser session", async () => {
  const { createIdeServer } = require("../src/web/ide-server");
  const previous = {
    adminWorkspaceApiKey: settings.adminWorkspaceApiKey,
    ideGuildId: settings.ideGuildId
  };
  settings.adminWorkspaceApiKey = "test-workspace-key-".padEnd(48, "x");
  settings.ideGuildId = "123456789012345678";
  const listedGuilds = [];
  const server = createIdeServer({}, {
    customCommands: {
      list: async (guildId) => {
        listedGuilds.push(guildId);
        return [];
      }
    }
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const response = await fetch("http://127.0.0.1:" + address.port + "/api/ai/workspace/files", {
      headers: { Authorization: "Bearer " + settings.adminWorkspaceApiKey }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { files: [] });
    assert.deepEqual(listedGuilds, ["123456789012345678"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    settings.adminWorkspaceApiKey = previous.adminWorkspaceApiKey;
    settings.ideGuildId = previous.ideGuildId;
  }
});

test("AI workspace bearer-key API refuses to run without a valid configured server ID", async () => {
  const { createIdeServer } = require("../src/web/ide-server");
  const previous = {
    adminWorkspaceApiKey: settings.adminWorkspaceApiKey,
    ideGuildId: settings.ideGuildId
  };
  settings.adminWorkspaceApiKey = "test-workspace-key-".padEnd(48, "x");
  settings.ideGuildId = "";
  const server = createIdeServer({}, { customCommands: { list: async () => [] } });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const response = await fetch("http://127.0.0.1:" + address.port + "/api/ai/workspace/files", {
      headers: { Authorization: "Bearer " + settings.adminWorkspaceApiKey }
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /IDE_GUILD_ID/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    settings.adminWorkspaceApiKey = previous.adminWorkspaceApiKey;
    settings.ideGuildId = previous.ideGuildId;
  }
});


test("AI workspace bearer-key API cannot publish or delete executable commands", async () => {
  const { createIdeServer } = require("../src/web/ide-server");
  const previous = {
    adminWorkspaceApiKey: settings.adminWorkspaceApiKey,
    ideGuildId: settings.ideGuildId
  };
  settings.adminWorkspaceApiKey = "test-workspace-key-".padEnd(48, "x");
  settings.ideGuildId = "123456789012345678";
  let published = false;
  let deleted = false;
  const server = createIdeServer({}, {
    customCommands: {
      getByName: async () => ({ id: "command-1", name: "safe_command" }),
      publishSource: async () => { published = true; },
      remove: async () => { deleted = true; }
    }
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const headers = {
      Authorization: "Bearer " + settings.adminWorkspaceApiKey,
      "Content-Type": "application/json"
    };
    const publish = await fetch("http://127.0.0.1:" + address.port + "/api/ai/workspace/files", {
      method: "POST",
      headers,
      body: JSON.stringify({ publish: true })
    });
    assert.equal(publish.status, 403);
    assert.match((await publish.json()).error, /drafts only/i);

    const remove = await fetch("http://127.0.0.1:" + address.port + "/api/ai/workspace/files/safe_command.js", {
      method: "DELETE",
      headers
    });
    assert.equal(remove.status, 403);
    assert.match((await remove.json()).error, /cannot delete/i);
    assert.equal(published, false);
    assert.equal(deleted, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    settings.adminWorkspaceApiKey = previous.adminWorkspaceApiKey;
    settings.ideGuildId = previous.ideGuildId;
  }
});
