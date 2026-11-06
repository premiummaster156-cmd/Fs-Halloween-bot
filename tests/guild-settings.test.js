const test = require("node:test");
const assert = require("node:assert/strict");
const { GuildSettingsService, settingKeys } = require("../src/services/guild-settings");
const settings = require("../src/config/settings");

test("member commands channel is configurable and has a safe default", async () => {
  assert.ok(settingKeys.has("memberCommandsChannelId"));
  const service = new GuildSettingsService({
    query: async () => ({ rowCount: 0, rows: [] })
  });
  assert.equal(await service.get("guild-1", "memberCommandsChannelId"), settings.memberCommandsChannelId);
  const all = await service.getAll("guild-1");
  assert.equal(all.memberCommandsChannelId, settings.memberCommandsChannelId);
});

test("clearing member commands channel restores the configured default", async () => {
  const service = new GuildSettingsService({
    query: async () => ({ rowCount: 1, rows: [{ setting_value: null }] })
  });
  assert.equal(await service.get("guild-1", "memberCommandsChannelId"), settings.memberCommandsChannelId);
});
