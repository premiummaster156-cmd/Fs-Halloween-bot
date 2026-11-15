"use strict";

const { MessageFlags } = require("discord.js");

const BUTTON_MODAL_ACTIONS = new Set([
  "fc-party-start",
  "dm-send-all",
  "dm-send-one",
  "grant-fc",
  "grant-xp",
  "remove-fc",
  "set-level",
  "exclude",
  "leaderboard-search",
  "trade-fc",
  "deposit",
  "withdraw",
  "heist-join",
  "heist-start",
  "heist-status"
]);

function isModalLaunchInteraction(interaction) {
  if (!interaction || interaction.isModalSubmit?.()) return false;
  if (!interaction.isButton?.() && !interaction.isAnySelectMenu?.()) return false;

  const [scope, , action = ""] = String(interaction.customId || "").split(":");
  if (scope === "admin") {
    if (interaction.isButton?.()) return BUTTON_MODAL_ACTIONS.has(action);
    return ["admin-abuse-type", "career-select"].includes(action);
  }
  if (scope === "dash") {
    if (interaction.isButton?.()) {
      return BUTTON_MODAL_ACTIONS.has(action) ||
        action.startsWith("casino-");
    }
    return action === "trade-item";
  }
  return false;
}

async function acknowledgeDashboardInteraction(interaction) {
  if (!interaction || typeof interaction.isRepliable !== "function" || !interaction.isRepliable()) {
    throw new TypeError("A repliable dashboard interaction is required.");
  }
  if (isModalLaunchInteraction(interaction)) {
    throw new Error("Modal-launch interactions must not be acknowledged before showModal().");
  }

  if (!interaction.deferred && !interaction.replied) {
    if (interaction.isModalSubmit?.()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } else {
      await interaction.deferUpdate();
    }
  }

  // Existing dashboard handlers continue to express their original response
  // style. After the acknowledgement, updates edit the deferred message,
  // duplicate deferrals are harmless, and denial replies become ephemeral.
  return new Proxy(interaction, {
    get(target, property) {
      if (property === "update") {
        return (payload) => target.deferred
          ? target.editReply(payload)
          : target.update(payload);
      }
      if (property === "deferUpdate" || property === "deferReply") {
        return (...args) => target.deferred || target.replied
          ? Promise.resolve()
          : property === "deferUpdate"
            ? target.deferUpdate(...args)
            : target.deferReply(...args);
      }
      if (property === "reply") {
        return (payload) => {
          if (!target.deferred && !target.replied) return target.reply(payload);
          if (target.deferred && target.ephemeral) {
            const editable = { ...payload };
            delete editable.flags;
            return target.editReply(editable);
          }
          return target.followUp({ ...payload, flags: MessageFlags.Ephemeral });
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

module.exports = { isModalLaunchInteraction, acknowledgeDashboardInteraction };
