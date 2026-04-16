# Database Migration Rules

## The Problem

This project has **four** files that must stay in sync when adding or modifying database tables:

| File | Purpose | Syntax |
|------|---------|--------|
| `packages/db/src/schema.ts` | Drizzle ORM schema (SQLite) | `sqliteTable(...)` |
| `packages/db/src/schema-pg.ts` | Drizzle ORM schema (PostgreSQL) | `pgTable(...)` |
| `packages/db/src/drivers/bun-sqlite.ts` | Inline SQLite migrations (run on import) | Raw `CREATE TABLE IF NOT EXISTS` SQL |
| `packages/db/src/migrate.ts` | Standalone SQLite migration script | Raw `CREATE TABLE IF NOT EXISTS` SQL |
| `packages/db/src/migrate-pg.ts` | Standalone PostgreSQL migration script | Raw `CREATE TABLE IF NOT EXISTS` SQL via `sql.unsafe()` |

> **Why five entries for four files?** `schema.ts` and `schema-pg.ts` are the ORM definitions. The other three are raw SQL that actually creates the tables at runtime. All five must agree on table names, column names, and types.

## Checklist: Adding a New Table

When adding a new table, update **all five files** in this order:

1. **`packages/db/src/schema.ts`** — Add the `sqliteTable(...)` definition with all columns. This is the canonical schema that the rest of the app imports.

2. **`packages/db/src/schema-pg.ts`** — Add the matching `pgTable(...)` definition. Use `serial('id').primaryKey()` instead of `integer('id').primaryKey({ autoIncrement: true })`. Everything else is the same.

3. **`packages/db/src/drivers/bun-sqlite.ts`** — Add a `CREATE TABLE IF NOT EXISTS` block inside the large `sqlite.exec(...)` call (or as a new `sqlite.exec(...)` block after it). This is what actually creates the table when the app starts in dev mode.

4. **`packages/db/src/migrate.ts`** — Add the same `CREATE TABLE IF NOT EXISTS` as a new `sqlite.exec(...)` block. This file is used by the standalone migration script entry point.

5. **`packages/db/src/migrate-pg.ts`** — Add the PostgreSQL version (`SERIAL PRIMARY KEY` instead of `INTEGER PRIMARY KEY AUTOINCREMENT`) as a new `await sql.unsafe(...)` block before `await sql.end()`.

Don't forget indexes — add `CREATE INDEX IF NOT EXISTS` in all three SQL files.

## Checklist: Adding a Column to an Existing Table

1. **`schema.ts`** — Add the column to the `sqliteTable(...)` definition.

2. **`schema-pg.ts`** — Add the column to the `pgTable(...)` definition.

3. **`drivers/bun-sqlite.ts`** — Add an `ALTER TABLE ... ADD COLUMN` line to the migrations array at the bottom of the file. Wrap in try-catch (the existing pattern handles this).

4. **`migrate.ts`** — Add an `addColumnSafe(table, column, type)` call.

5. **`migrate-pg.ts`** — No automatic column additions exist here yet. For now, add the column to the initial `CREATE TABLE` block (safe for new deployments). For existing PG databases, run the ALTER manually.

## Column Naming Convention

- **Schema files** (`.ts`): Use camelCase (`jobUrl`, `createdAt`, `driveDocId`)
- **SQL files** (raw SQL): Use snake_case (`job_url`, `created_at`, `drive_doc_id`)
- Drizzle maps between them via the column name argument: `jobUrl: text('job_url')`

## Migration Strategy

- **Additive only** — never drop columns or tables in migrations
- **Idempotent** — all migrations use `IF NOT EXISTS` or try-catch wrappers
- **No migration tracking table** — the project relies on defensive SQL rather than a version counter
- **Startup execution** — migrations run every time the app boots (via `bun-sqlite.ts` import or `ensureDb()`)

## Sync Check Script

Run `pnpm migrate:check` to verify all tables in `schema.ts` exist in every migration file:

```bash
pnpm migrate:check
```

The script (`scripts/migrate-check.mjs`) extracts table names from all five files and reports any mismatches. Run it after adding a new table to catch missing files before you hit `no such table` at runtime.

Example output when a table is missing:

```
Found 18 tables in schema.ts:
  uploads, document_embeddings, jobs, ...

MISSING from drivers/bun-sqlite.ts (1):
  - my_new_table

Some tables are not defined in all migration files.
```

## Common Mistakes

| Mistake | What happens |
|---------|-------------|
| Only updating `schema.ts` | Drizzle knows about the table but SQLite never creates it → `no such table` at runtime |
| Only updating `bun-sqlite.ts` | Table exists but Drizzle has no ORM mapping → queries fail |
| Forgetting `schema-pg.ts` | Breaks if `DATABASE_URL` is set (PostgreSQL mode) |
| Forgetting `migrate-pg.ts` | PostgreSQL deployments won't have the table |
| Using `AUTOINCREMENT` in PG SQL | PostgreSQL syntax error — use `SERIAL` instead |
| Using `serial()` in SQLite schema | Wrong Drizzle import — use `integer().primaryKey({ autoIncrement: true })` |

## Quick Reference: Type Mapping

| Concept | SQLite (`schema.ts`) | PostgreSQL (`schema-pg.ts`) | SQLite SQL | PostgreSQL SQL |
|---------|---------------------|---------------------------|------------|----------------|
| Auto-increment PK | `integer('id').primaryKey({ autoIncrement: true })` | `serial('id').primaryKey()` | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| Text | `text('name')` | `text('name')` | `TEXT` | `TEXT` |
| Integer | `integer('count')` | `integer('count')` | `INTEGER` | `INTEGER` |
| Boolean | `integer('flag', { mode: 'boolean' })` | `integer('flag')` | `INTEGER DEFAULT 0` | `INTEGER DEFAULT 0` |
| JSON (stored as text) | `text('data')` | `text('data')` | `TEXT` | `TEXT` |
