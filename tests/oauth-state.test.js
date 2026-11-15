const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { rateLimitOAuthStart } = require("../src/web/ide-server");

test("browser OAuth start attempts are rate-limited per source address and recover after the window", () => {
  const req = { socket: { remoteAddress: "oauth-test-" + randomUUID() } };
  const now = 1_800_000_000_000;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(rateLimitOAuthStart(req, now + attempt), true);
  }
  assert.equal(rateLimitOAuthStart(req, now + 11), false);
  assert.equal(rateLimitOAuthStart(req, now + 60_001), true);
});

test("OAuth rate limiting safely handles requests without a socket address", () => {
  const req = {};
  const now = 1_900_000_000_000;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(rateLimitOAuthStart(req, now + attempt), true);
  }
  assert.equal(rateLimitOAuthStart(req, now + 11), false);
});
