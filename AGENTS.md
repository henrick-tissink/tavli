<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Migrations — `drizzle-kit generate` is BANNED (audit #16)

`src/lib/db/schema.ts` is **descriptive-only**: it documents the live schema for
type-safe queries, but it is NOT the migration source of truth. The drizzle meta
snapshots (`drizzle/migrations/meta/`) are intentionally frozen at snapshot 0028,
so `drizzle-kit generate` would emit a giant phantom migration. The `db:generate`
npm script is disabled and fails loudly.

To change the schema:
1. Hand-author `drizzle/migrations/NNNN_<name>.sql` (next sequential number).
2. Append a matching entry to `drizzle/migrations/meta/_journal.json`.
3. Update `schema.ts` to match (descriptive).
4. Apply via `psql "$DATABASE_URL" -f <file>` locally; prod is applied the same
   way with the 3-step bookkeeping row in `drizzle.__drizzle_migrations`
   (see the `deploy_setup` convention).

Migrations are additive (no DROP/TRUNCATE) and safe to apply ahead of code.
