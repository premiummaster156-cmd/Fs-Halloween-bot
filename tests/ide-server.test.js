process.env.FUKISHOKAI_GUILD_ID = "123456789012345678";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isBrowserIdeEnabled, isIdeServerEnabled, authoriseMember } = require("../src/web/ide-server");
const { randomUUID } = require("node:crypto");

test("Code Studio stays disabled without browser OAuth configuration", () => {
  const config = {
    ideGuildId: "123456789012345678",
    discordClientSecret: "",
    idePublicUrl: ""
  };

  assert.equal(isBrowserIdeEnabled(config), false);
  assert.equal(isIdeServerEnabled(config), false);
});

test("browser Code Studio needs OAuth settings but selects its guild from the admin-panel link", () => {
  const config = {
    ideGuildId: "123456789012345678",
    discordClientSecret: "discord-client-secret",
    idePublicUrl: "https://studio.example.com"
  };

  assert.equal(isBrowserIdeEnabled(config), true);
  assert.equal(isIdeServerEnabled(config), true);
});

test("workspace server stays disabled without a guild and a supported feature", () => {
  assert.equal(isIdeServerEnabled({
    ideGuildId: "",
    discordClientSecret: "",
    idePublicUrl: ""
  }), false);
  assert.equal(isIdeServerEnabled({
    ideGuildId: "123456789012345678",
    discordClientSecret: "",
    idePublicUrl: ""
  }), false);
});
test("browser Code Studio is pinned to the configured Fukishokai server persona", () => {
  const config = {
    ideGuildId: "123456789012345678",
    discordClientSecret: "discord-client-secret",
    idePublicUrl: "https://studio.example.com"
  };
  assert.equal(isBrowserIdeEnabled(config), true);
  assert.equal(isIdeServerEnabled(config), true);
  assert.equal(isIdeServerEnabled({ ...config, ideGuildId: "123456789012345672" }), false);
  assert.equal(isIdeServerEnabled({ ...config, ideGuildId: "" }), false);
});

test("Code Studio checks the trusted Admin Role in the exact server selected by the admin-panel link", async () => {
  const userId = "workspace-admin-" + randomUUID();
  const guilds = new Map();
  const roleByGuild = {
    "123456789012345678": "trusted-role-a",
    "123456789012345672": "trusted-role-b"
  };
  for (const guildId of Object.keys(roleByGuild)) {
    guilds.set(guildId, {
      id: guildId,
      name: "Server " + guildId,
      ownerId: "owner-" + guildId,
      members: {
        fetch: async () => ({
          roles: { cache: { has: (roleId) => guildId.endsWith("678") && roleId === roleByGuild[guildId] } }
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

  const access = await authoriseMember(client, services, userId, "123456789012345678");
  assert.equal(access.guild.id, "123456789012345678");
  await assert.rejects(
    authoriseMember(client, services, userId, "123456789012345672"),
    /only for the Fukishōkai server persona/
  );
  await assert.rejects(
    authoriseMember(client, services, userId, "../other"),
    /server ID/
  );
});


test("the removed external workspace-agent endpoint is no longer exposed", async () => {
  const { createIdeServer } = require("../src/web/ide-server");
  const server = createIdeServer({}, {});
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const response = await fetch("http://127.0.0.1:" + address.port + "/api/ai/workspace/files");
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Code Studio prunes expired OAuth states and sessions from bounded stores", () => {
  const { pruneExpiredEntries } = require("../src/web/ide-server");
  const entries = new Map([
    ["expired", { expiresAt: 99 }],
    ["active", { expiresAt: 101 }],
    ["invalid", {}]
  ]);
  assert.equal(pruneExpiredEntries(entries, (entry) => entry.expiresAt, 100), 1);
  assert.deepEqual([...entries.keys()], ["active"]);
});

test("CoopFT and Fukishokai OAuth start throttling has a fixed per-address limit", () => {
  const { rateLimitOAuthStart } = require("../src/web/ide-server");
  const req = { socket: { remoteAddress: "coopft-oauth-test" } };
  const now = 1_900_000_000_000;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(rateLimitOAuthStart(req, now + attempt), true);
  }
  assert.equal(rateLimitOAuthStart(req, now + 11), false);
});
