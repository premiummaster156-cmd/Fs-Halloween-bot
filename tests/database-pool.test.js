"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { withVerifiedSslMode } = require("../src/database/pool");

test("replaces legacy sslmode=require with explicit verified TLS", () => {
  const url = "postgresql://user:password@ep.example.neon.tech/db?sslmode=require";
  assert.equal(
    withVerifiedSslMode(url),
    "postgresql://user:password@ep.example.neon.tech/db?sslmode=verify-full"
  );
});

test("preserves unrelated query parameters while normalizing SSL mode", () => {
  const url = "postgresql://user:password@ep.example.neon.tech/db?sslmode=require&channel_binding=require";
  assert.equal(
    withVerifiedSslMode(url),
    "postgresql://user:password@ep.example.neon.tech/db?sslmode=verify-full&channel_binding=require"
  );
});

test("maps legacy prefer and verify-ca aliases to verify-full", () => {
  assert.equal(
    withVerifiedSslMode("postgresql://db.example.com/app?sslmode=prefer"),
    "postgresql://db.example.com/app?sslmode=verify-full"
  );
  assert.equal(
    withVerifiedSslMode("postgresql://db.example.com/app?sslmode=verify-ca"),
    "postgresql://db.example.com/app?sslmode=verify-full"
  );
});

test("adds verified TLS to Neon URLs without an explicit sslmode", () => {
  assert.equal(
    withVerifiedSslMode("postgresql://user:password@ep.example.neon.tech/app"),
    "postgresql://user:password@ep.example.neon.tech/app?sslmode=verify-full"
  );
});

test("leaves explicit verify-full URLs and non-Neon URLs unchanged", () => {
  const verified = "postgresql://user:password@ep.example.neon.tech/db?sslmode=verify-full";
  const local = "postgresql://user:password@localhost/app";
  assert.equal(withVerifiedSslMode(verified), verified);
  assert.equal(withVerifiedSslMode(local), local);
});

test("handles empty or non-string configuration safely", () => {
  assert.equal(withVerifiedSslMode(""), "");
  assert.equal(withVerifiedSslMode(null), null);
});
