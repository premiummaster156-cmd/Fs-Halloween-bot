"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { Events, GatewayIntentBits } = require("discord.js");
const { runCoopFTSetup } = require("../scripts/setup-coopft");

test("the hosting-console setup migrates, connects to only CoopFT, and runs bootstrap once", async () => {
  const order = [];
  const guildId = "123456789012345678";
  const guild = { id: guildId, name: "CoopFT" };
  const client = new EventEmitter();
  client.login = async (token) => {
    order.push("login:" + token);
    queueMicrotask(() => client.emit(Events.ClientReady, client));
  };
  client.guilds = {
    fetch: async (id) => {
      order.push("fetch:" + id);
      return guild;
    }
  };
  client.destroy = () => order.push("destroy");

  let bootstrapArgs;
  const result = await runCoopFTSetup({
    token: "test-token",
    guildId,
    testOnlyAllowGuildIdOverride: true,
    migrateDatabase: async () => order.push("migrate"),
    clientFactory: () => client,
    serviceFactory: () => ({
      bootstrap: async (...args) => {
        bootstrapArgs = args;
        order.push("bootstrap");
        return {
          createdRoles: 10,
          createdChannels: 18,
          createdEmojis: 16,
          cleanup: { awaitingConfirmation: true, candidates: [] },
          emojiResult: { failed: [] }
        };
      }
    }),
    databasePool: { end: async () => order.push("pool-end") },
    logger: { info() {}, warn() {} }
  });

  assert.equal(result.guildId, guildId);
  assert.equal(bootstrapArgs[0], guild);
  assert.equal(bootstrapArgs[1].source, "hosting-console");
  assert.deepEqual(order, [
    "migrate",
    "login:test-token",
    "fetch:" + guildId,
    "bootstrap",
    "destroy",
    "pool-end"
  ]);
});

test("the hosting-console setup refuses any server other than the verified CoopFT ID before database or Discord access", async () => {
  let migrated = false;
  let connected = false;
  await assert.rejects(
    runCoopFTSetup({
      token: "test-token",
      guildId: "111111111111111111",
      migrateDatabase: async () => { migrated = true; },
      clientFactory: () => { connected = true; return new EventEmitter(); },
      closePool: false
    }),
    /Safety lock: CoopFT setup is allowed only for server 1498271944456540210/
  );
  assert.equal(migrated, false);
  assert.equal(connected, false);
});

test("the hosting-console setup rejects missing credentials before connecting", async () => {
  let connected = false;
  let migrated = false;
  await assert.rejects(
    runCoopFTSetup({
      token: "",
      guildId: "123456789012345678",
      testOnlyAllowGuildIdOverride: true,
      migrateDatabase: async () => { migrated = true; },
      clientFactory: () => { connected = true; return new EventEmitter(); },
      closePool: false
    }),
    /DISCORD_TOKEN is missing/
  );
  assert.equal(migrated, false);
  assert.equal(connected, false);
});

test("the hosting-console setup closes the client and pool when bootstrap fails", async () => {
  const order = [];
  const guildId = "123456789012345678";
  const client = new EventEmitter();
  client.login = async () => queueMicrotask(() => client.emit(Events.ClientReady, client));
  client.guilds = { fetch: async () => ({ id: guildId, name: "CoopFT" }) };
  client.destroy = () => order.push("destroy");

  await assert.rejects(
    runCoopFTSetup({
      token: "test-token",
      guildId,
      testOnlyAllowGuildIdOverride: true,
      migrateDatabase: async () => order.push("migrate"),
      clientFactory: () => client,
      serviceFactory: () => ({ bootstrap: async () => { throw new Error("permission denied"); } }),
      databasePool: { end: async () => order.push("pool-end") },
      logger: { info() {}, warn() {} }
    }),
    /permission denied/
  );
  assert.deepEqual(order, ["migrate", "destroy", "pool-end"]);
});

test("normal bot startup does not bootstrap or reconfigure CoopFT resources", () => {
  const indexPath = path.join(__dirname, "..", "src", "index.js");
  const source = fs.readFileSync(indexPath, "utf8");
  assert.doesNotMatch(source, /coopftCommunity\.bootstrap\(/);
  assert.doesNotMatch(source, /coopftSetupPromise|coopftSetupError/);
  assert.match(source, /memberLifecycle\.handleJoin\(member\)/);
  assert.match(source, /memberLifecycle\.handleLeave\(member\)/);
});

test("the CoopFT hosting-console command is exposed in package scripts", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.equal(packageJson.scripts["coopft:setup"], "node scripts/setup-coopft.js");
});
