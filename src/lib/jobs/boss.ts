/**
 * pg-boss singleton + lifecycle per foundations §10.2 / §17.7.
 *
 * Why a singleton: pg-boss holds a Postgres LISTEN/NOTIFY pool per
 * instance. Multiple instances multiply the connection count and
 * fragment the worker's view of pending jobs. Both the web app
 * (enqueuer side) and the worker process (handler side) share this
 * module — they call `getBoss()` to lazily construct one boss per
 * Node process and reuse it.
 *
 * Why a separate URL: Supabase's pgbouncer (transaction mode) drops
 * LISTEN channels between transactions. pg-boss MUST bypass it — use
 * the "Direct connection" string in `PGBOSS_DATABASE_URL`. The web
 * app's `DATABASE_URL` keeps using pgbouncer; only this module
 * connects directly.
 *
 * boss.start() creates the `pgboss` schema on first call (idempotent).
 * No drizzle migration is committed for it — pg-boss owns its schema
 * and runs internal migrations across version bumps.
 */

import "server-only";
import PgBoss from "pg-boss";

let bossInstance: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (bossInstance) return bossInstance;
  if (starting) return starting;

  const url = process.env.PGBOSS_DATABASE_URL;
  if (!url) {
    throw new Error(
      "PGBOSS_DATABASE_URL missing. pg-boss requires a direct Postgres " +
        "connection string (Supabase: project settings → 'Direct connection'); " +
        "the pgbouncer-fronted DATABASE_URL drops LISTEN channels and will not work.",
    );
  }

  starting = (async () => {
    const boss = new PgBoss({
      connectionString: url,
      // Pool small — one worker process; raise only after splitting per
      // foundations §17.1.
      max: 4,
      // Cron processing runs in the worker, not in the web app. The web
      // process enqueues + reads queue depth but never owns the
      // schedule loop.
      schedule: process.env.WORKER_MODE === "true",
    });

    boss.on("error", (err) => {
      console.error("[pg-boss] error:", err);
    });

    await boss.start();
    bossInstance = boss;
    return boss;
  })();

  return starting;
}

export async function stopBoss(): Promise<void> {
  if (!bossInstance) return;
  await bossInstance.stop({ graceful: true });
  bossInstance = null;
  starting = null;
}
