"use strict";

function isPrivateCommandReply(command, customCommand) {
  if (command) {
    return command.data?.name === "admin-panel" || command.data?.name === "menu";
  }
  if (!customCommand) return true;
  return customCommand.definition?.response?.visibility !== "public";
}

module.exports = { isPrivateCommandReply };
