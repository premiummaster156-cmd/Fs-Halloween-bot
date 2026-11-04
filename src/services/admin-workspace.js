"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const WORKSPACE_ROOT = path.resolve(
  process.env.ADMIN_WORKSPACE_DIR || path.join(process.cwd(), "admin-workspace")
);

function validateGuildId(guildId) {
  const value = String(guildId || "");
  if (!/^\d{1,25}$/.test(value)) {
    const error = new Error("A valid Discord server ID is required for the admin workspace.");
    error.code = "ADMIN_WORKSPACE_INVALID_PATH";
    throw error;
  }
  return value;
}

function validateCommandName(name) {
  const value = String(name || "");
  if (!/^[a-z0-9_-]{1,32}$/.test(value)) {
    const error = new Error("Command file names must use lowercase letters, numbers, hyphens or underscores.");
    error.code = "ADMIN_WORKSPACE_INVALID_PATH";
    throw error;
  }
  return value;
}

function getGuildDirectory(guildId, root = WORKSPACE_ROOT) {
  return path.join(path.resolve(root), validateGuildId(guildId));
}

function getCommandFilePath(guildId, name, root = WORKSPACE_ROOT) {
  const directory = getGuildDirectory(guildId, root);
  const target = path.resolve(directory, validateCommandName(name) + ".js");
  if (!target.startsWith(directory + path.sep)) {
    const error = new Error("The command file path is outside the admin workspace.");
    error.code = "ADMIN_WORKSPACE_INVALID_PATH";
    throw error;
  }
  return target;
}

async function writeCommandFile(guildId, name, sourceCode, root = WORKSPACE_ROOT) {
  if (typeof sourceCode !== "string" || !sourceCode.trim() || sourceCode.length > 50000) {
    const error = new Error("JavaScript command files must contain 1–50,000 characters.");
    error.code = "CUSTOM_COMMAND_INVALID";
    throw error;
  }
  const filePath = getCommandFilePath(guildId, name, root);
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = filePath + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(temporaryPath, sourceCode, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
  return filePath;
}

async function readCommandFile(guildId, name, root = WORKSPACE_ROOT) {
  const filePath = getCommandFilePath(guildId, name, root);
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function deleteCommandFile(guildId, name, root = WORKSPACE_ROOT) {
  const filePath = getCommandFilePath(guildId, name, root);
  await fs.rm(filePath, { force: true });
  return filePath;
}

async function listCommandFiles(guildId, root = WORKSPACE_ROOT) {
  const directory = getGuildDirectory(guildId, root);
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && /^[a-z0-9_-]{1,32}\.js$/.test(entry.name))
    .map((entry) => ({
      name: entry.name.slice(0, -3),
      path: path.relative(process.cwd(), path.join(directory, entry.name)).split(path.sep).join("/")
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  WORKSPACE_ROOT,
  validateGuildId,
  validateCommandName,
  getGuildDirectory,
  getCommandFilePath,
  writeCommandFile,
  readCommandFile,
  deleteCommandFile,
  listCommandFiles
};
