"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { withLibpqSslCompatibility } = require("../src/database/pool");

test("adds libpq compatibility for legacy sslmode=require URLs", () => {
  const url = "postgresql://user:password@ep.example.neon.tech/db?sslmode=require";
  assert.equal(
    withLibpqSslCompatibility(url),
    url + "&uselibpqcompat=true"
  );
});

test("does not duplicate an existing libpq compatibility setting", () => {
  const url = "postgresql://user:password@ep.example.neon.tech/db?sslmode=require&uselibpqcompat=false";
  assert.equal(withLibpqSslCompatibility(url), url);
});

test("does not alter URLs using explicit verify-full SSL mode", () => {
  const url = "postgresql://user:password@db.example.com/app?sslmode=verify-full";
  assert.equal(withLibpqSslCompatibility(url), url);
});

test("does not alter a connection string without sslmode=require", () => {
  const url = "postgresql://user:password@localhost/app";
  assert.equal(withLibpqSslCompatibility(url), url);
});

test("handles empty or non-string configuration safely", () => {
  assert.equal(withLibpqSslCompatibility(""), "");
  assert.equal(withLibpqSslCompatibility(null), null);
});
