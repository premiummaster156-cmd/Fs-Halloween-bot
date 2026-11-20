"use strict";

const { Routes } = require("discord.js");

/**
 * Register the current CoopFT command set on the CoopFT guild only.
 * This intentionally does not touch global commands or Fukishokai commands.
 */
async function registerCoopFTGuildCommands({ rest, clientId, guildId, commands }) {
  if (!rest || typeof rest.put !== "function") {
    throw new TypeError("A Discord REST client is required to register CoopFT commands.");
  }
  if (!/^\d{17,25}$/.test(String(clientId || ""))) {
    throw new Error("A valid Discord application client ID is required.");
  }
  if (!/^\d{17,25}$/.test(String(guildId || ""))) {
    throw new Error("A valid CoopFT guild ID is required.");
  }
  if (!commands || typeof commands.values !== "function") {
    throw new TypeError("The CoopFT command registry is not available.");
  }

  const body = Array.from(commands.values(), (command) => {
    if (!command?.data || typeof command.data.toJSON !== "function") {
      throw new Error("The CoopFT command registry contains an invalid command.");
    }
    return command.data.toJSON();
  });

  const route = Routes.applicationGuildCommands(String(clientId), String(guildId));
  await rest.put(route, { body });
  return { guildId: String(guildId), registeredCount: body.length, commandNames: body.map((command) => command.name) };
}

module.exports = { registerCoopFTGuildCommands };
