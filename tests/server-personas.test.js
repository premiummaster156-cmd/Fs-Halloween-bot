"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const {
  COOPFT_DEFAULT_GUILD_ID, coopftGuildId, fukishokaiGuildId,
  personaForGuild, configuredGuildIds
} = require("../src/config/server-personas");

const ROOT = path.join(__dirname, "..");

test("server personas keep the CoopFT ID pinned and Fukishokai separate", () => {
  assert.equal(COOPFT_DEFAULT_GUILD_ID, "1498271944456540210");
  assert.equal(coopftGuildId, COOPFT_DEFAULT_GUILD_ID);
  assert.equal(personaForGuild(COOPFT_DEFAULT_GUILD_ID), "coopft");
  if (fukishokaiGuildId) {
    assert.notEqual(fukishokaiGuildId, COOPFT_DEFAULT_GUILD_ID);
    assert.equal(personaForGuild(fukishokaiGuildId), "fukishokai");
  }
  assert.ok(configuredGuildIds().includes(COOPFT_DEFAULT_GUILD_ID));
});

test("shared Fukishokai services cannot access CoopFT lifecycle or community service instances", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/index.js"), "utf8");
  const servicesStart = source.indexOf("client.services = {");
  const servicesEnd = source.indexOf("\n  };", servicesStart);
  assert.notEqual(servicesStart, -1);
  assert.notEqual(servicesEnd, -1);
  const sharedServices = source.slice(servicesStart, servicesEnd);
  assert.doesNotMatch(sharedServices, /memberLifecycle/);
  assert.doesNotMatch(sharedServices, /coopftCommunity/);
  assert.match(source, /if \(member\.guild\.id === coopftGuildId\)[\s\S]{0,240}memberLifecycle\.handleJoin\(member\)/);
  assert.doesNotMatch(source, /raidMonitor|recordDestructiveChange|recordPrivilegeEscalation|monitorSecurityChange/);
  assert.match(source, /if \(guild\.id !== coopftGuildId \|\| !memberLifecycle \|\| !coopftCommunity\) return/);
  assert.match(source, /memberLifecycle\.handleServerAuditEntry\(guild, entry, client\.user\.id\)/);
});

test("a COOPFT_GUILD_ID override to any other server fails closed", () => {
  assert.throws(() => execFileSync(process.execPath, [
    "-e",
    "require('./src/config/server-personas')"
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      COOPFT_GUILD_ID: "111111111111111111",
      FUKISHOKAI_GUILD_ID: "222222222222222222"
    },
    stdio: "pipe"
  }), (error) => {
    const output = String(error.stderr || error.message);
    assert.match(output, /COOPFT_GUILD_ID is safety-locked/);
    return true;
  });
});

test("Fukishokai cannot be configured to share the CoopFT server ID", () => {
  assert.throws(() => execFileSync(process.execPath, [
    "-e",
    "require('./src/config/server-personas')"
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      COOPFT_GUILD_ID: COOPFT_DEFAULT_GUILD_ID,
      FUKISHOKAI_GUILD_ID: COOPFT_DEFAULT_GUILD_ID,
      GUILD_ID: ""
    },
    stdio: "pipe"
  }), (error) => {
    const output = String(error.stderr || error.message);
    assert.match(output, /cannot equal the CoopFT server ID/);
    return true;
  });
});

test("Fukishokai system channel suppresses native member-join and boost notices", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/index.js"), "utf8");
  const start = source.indexOf("const nativeNoticeFlags = [");
  const end = source.indexOf("console.info(\"[fukishokai] Native member-join and boost notices", start);
  assert.notEqual(start, -1, "Fukishokai system-channel suppression flags must exist");
  assert.notEqual(end, -1, "Fukishokai system-channel suppression log must exist");
  const block = source.slice(start, end);
  assert.ok(block.includes("SystemChannelFlags.SuppressJoinNotifications"));
  assert.ok(block.includes("SystemChannelFlags.SuppressJoinNotificationReplies"));
  assert.ok(block.includes("SystemChannelFlags.SuppressPremiumSubscriptions"));
  assert.ok(source.includes("fsGuild.edit("));
  assert.ok(source.includes("Suppress native member-join and boost notices in Fukishōkai"));
});
