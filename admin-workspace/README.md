# Admin Workspace

Runtime JavaScript slash-command files are stored here as:

`admin-workspace/<discord-server-id>/<command-name>.js`

The bot mirrors approved command files from PostgreSQL on startup and writes each Code Studio or AI workspace save to disk immediately. Mount persistent storage at this directory on hosts with ephemeral filesystems. PostgreSQL is the recovery copy.

## JavaScript command format

Each file is a CommonJS JavaScript module. Its exported `data` describes the slash command, and `execute(interaction)` contains the command logic:

```js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription("Say hello"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("Hello")
      .setDescription(`Hello, ${interaction.user.username}!`)
      .setColor("#B46A86");

    await interaction.reply({ embeds: [embed] });
  }
};
```

Commands run as JavaScript in a separate `isolated-vm` runner. The command runtime exposes a restricted Discord.js-compatible builder and interaction facade; it does not expose the bot token, Node.js process, arbitrary modules, direct filesystem access, network access, or the live bot client. This is intentional: custom command source is executable code. Supported interaction responses are `reply`, `editReply`, and `followUp`; supported option accessors include `getString`, `getInteger`, `getNumber`, `getBoolean`, `getUser`, `getMember`, `getRole`, `getChannel`, and `getMentionable`.

## AI workspace API

To let an external AI agent create, inspect, update, publish, and delete command files, set both:

- `IDE_GUILD_ID` to the Discord server ID the agent is allowed to manage.
- `ADMIN_WORKSPACE_API_KEY` to a long random secret (at least 32 characters).

The AI API can run without configuring Discord OAuth. The host must expose the bot's HTTP port publicly. Send the key only as a bearer token; never place it in a URL or source file.

Base path: `/api/ai/workspace`

### List command files

`GET /api/ai/workspace/files`

Response shape:

```json
{
  "files": [
    {
      "name": "hello.js",
      "path": "admin-workspace/123456789012345678/hello.js",
      "sourceCode": "module.exports = { /* ... */ };",
      "isActive": true,
      "deployed": true
    }
  ]
}
```

### Create or update a command

`POST /api/ai/workspace/files`

Send JSON with the file name and the complete JavaScript source. The exported `data.name` must match the file name without `.js`.

```json
{
  "fileName": "hello.js",
  "publish": true,
  "sourceCode": "const { SlashCommandBuilder } = require('discord.js');\\nmodule.exports = { data: new SlashCommandBuilder().setName('hello').setDescription('Say hello'), async execute(interaction) { await interaction.reply({ content: 'Hello!' }); } };"
}
```

- Omit `publish` or set it to `true` to save the file, register its slash-command definition with Discord, and activate it.
- Set `publish` to `false` to save a draft without activating it.
- Re-saving an existing command replaces its source and deactivates the previous version until it is published again.

### Read one file

`GET /api/ai/workspace/files/hello.js`

### Delete a command

`DELETE /api/ai/workspace/files/hello.js`

Deletion removes the command from the workspace and re-syncs the server's slash-command registrations.

## Live updates

Publishing or deleting a command calls Discord's application-command API while the bot process remains online. The next interaction loads the latest saved JavaScript source from the workspace. No bot or server restart is required. Discord's command registration can take a short time to appear in the client after a sync.

The bot still needs a restart to install new dependencies or change its own core source code. The workspace is for custom slash commands, not a general-purpose remote code deployment system.
