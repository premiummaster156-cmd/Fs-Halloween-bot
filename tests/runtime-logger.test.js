"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const {
  createRuntimeLogger,
  guardEmitter
} = require("../src/utils/runtime-logger");

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fukishokai-logs-"));
}

test("runtime logger persists formatted messages with timestamps and levels", () => {
  const directory = temporaryDirectory();
  const output = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
  try {
    const logger = createRuntimeLogger({ logDirectory: directory, consoleObject: output });
    logger.info("startup", { version: 1 });
    logger.error("database failed", new Error("connection reset"));

    const contents = fs.readFileSync(logger.file, "utf8");
    assert.match(contents, /\d{4}-\d{2}-\d{2}T.* \[INFO\] startup \{ version: 1 \}/);
    assert.match(contents, /\[ERROR\] database failed Error: connection reset/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime logger rotates old log files instead of growing without limit", () => {
  const directory = temporaryDirectory();
  const output = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
  try {
    const logger = createRuntimeLogger({
      logDirectory: directory,
      maxFileBytes: 64 * 1024,
      backupFiles: 2,
      consoleObject: output
    });
    logger.info("first " + "x".repeat(40 * 1024));
    logger.info("second " + "y".repeat(40 * 1024));

    assert.ok(fs.existsSync(logger.file));
    assert.ok(fs.existsSync(logger.file + ".1"));
    assert.ok(fs.statSync(logger.file).size <= 64 * 1024);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("guardEmitter contains synchronous listener exceptions and keeps other listeners running", () => {
  const directory = temporaryDirectory();
  const output = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
  const logger = createRuntimeLogger({ logDirectory: directory, consoleObject: output });
  const emitter = new EventEmitter();
  let recovered = 0;
  let nextListenerRan = false;

  try {
    guardEmitter(emitter, {
      logger,
      onError: () => { recovered += 1; }
    });
    emitter.on("work", () => { throw new Error("handler exploded"); });
    emitter.on("work", () => { nextListenerRan = true; });
    emitter.emit("work");

    assert.equal(recovered, 1);
    assert.equal(nextListenerRan, true);
    assert.match(fs.readFileSync(logger.file, "utf8"), /handler exploded/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("guardEmitter contains rejected async listeners and supports listener removal", async () => {
  const directory = temporaryDirectory();
  const output = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
  const logger = createRuntimeLogger({ logDirectory: directory, consoleObject: output });
  const emitter = new EventEmitter();
  let recovered = 0;
  let calls = 0;
  const handler = async () => {
    calls += 1;
    throw new Error("async handler exploded");
  };

  try {
    guardEmitter(emitter, {
      logger,
      onError: () => { recovered += 1; }
    });
    emitter.on("work", handler);
    emitter.emit("work");
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(recovered, 1);
    assert.equal(calls, 1);
    assert.match(fs.readFileSync(logger.file, "utf8"), /async handler exploded/);

    emitter.off("work", handler);
    emitter.emit("work");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
