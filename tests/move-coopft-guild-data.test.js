"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { insertRows } = require("../src/database/move-coopft-guild-data");

const settingColumns = [
  { column_name: "guild_id", is_generated: "NEVER", is_identity: "NO" },
  { column_name: "setting_key", is_generated: "NEVER", is_identity: "NO" },
  { column_name: "setting_value", is_generated: "NEVER", is_identity: "NO" },
  { column_name: "updated_at", is_generated: "NEVER", is_identity: "NO" }
];

test("CoopFT transfer preserves legacy SQL NULL setting values as JSONB null", async () => {
  let captured = null;
  const client = {
    async query(sql, params) {
      captured = { sql, params };
      return { rowCount: 1, rows: [] };
    }
  };

  await insertRows(
    client,
    "coopft_community_settings",
    settingColumns,
    ['{"guild_id":"1498271944456540210","setting_key":"legacy_setting","setting_value":null,"updated_at":"2026-11-19T00:00:00.000Z"}']
  );

  assert.ok(captured);
  assert.match(captured.sql, /COALESCE\(source_rows\."setting_value", 'null'::jsonb\)/);
  assert.match(captured.sql, /source_rows\."setting_key"/);
  assert.equal(captured.params.length, 1);
  assert.match(captured.params[0], /"setting_value":null/);
});

test("CoopFT transfer does not rewrite setting values in unrelated tables", async () => {
  let captured = null;
  const client = {
    async query(sql, params) {
      captured = { sql, params };
      return { rowCount: 1, rows: [] };
    }
  };

  await insertRows(client, "guild_settings", settingColumns, [
    '{"guild_id":"1498271944456540210","setting_key":"example","setting_value":null,"updated_at":"2026-11-19T00:00:00.000Z"}'
  ]);

  assert.doesNotMatch(captured.sql, /COALESCE\(source_rows\."setting_value"/);
  assert.match(captured.sql, /source_rows\."setting_value"/);
});
