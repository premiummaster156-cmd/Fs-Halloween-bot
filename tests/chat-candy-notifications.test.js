const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("chat activity continues earning Candy without public per-drop announcements", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /activity\.trackMessage\(message, roleIds\)/);
  assert.doesNotMatch(source, /sendCandyDropNotification/);
  assert.doesNotMatch(source, /Candy drop announcement failed/);
});
