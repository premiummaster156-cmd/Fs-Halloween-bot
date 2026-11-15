# Neon database migrations

Place new, forward-only SQL migrations in this directory using the filename format
`NNNN_short_description.sql`, for example `0001_add_player_flag.sql`.

Rules:

- Migration numbers must be unique and are applied in lexical/numeric order.
- Never edit or delete a migration after it has been applied to a database.
- The runner stores a SHA-256 checksum for each migration in `schema_migrations`.
  If an applied migration's contents change, startup fails closed and asks for a
  new migration instead.
- Each startup migration run is protected by a PostgreSQL transaction-scoped
  advisory lock. The legacy idempotent `schema.sql` bootstrap is retained for
  existing installations.
- Keep migrations additive and backwards-compatible where possible. Back up
  Neon before production schema changes and test against a disposable/staging
  database first.
- CI tests the runner with a transaction mock. It does not connect to or mutate
  the production Neon database.

Do not put credentials, environment-specific data, or player data in migration
files.
