# Admin Workspace

Runtime JavaScript slash-command files are stored here under `admin-workspace/<discord-server-id>/<command-name>.js`. The bot mirrors approved command files from PostgreSQL on startup and writes each Code Studio or AI workspace save to disk immediately. Keep a persistent disk mounted at this directory when using a host with ephemeral storage.
