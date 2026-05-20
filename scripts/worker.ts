/**
 * pg-boss worker entrypoint. Run as a separate Coolify service alongside
 * the web app, per foundations §10.3. Same Docker image; this script is
 * the entry instead of `next start`.
 *
 * Wave 1 substrate only — boots pg-boss and waits. Job handlers register
 * with the boss when their owning domain unit lands (reservation
 * reminders, marketing fan-out, billing reconciliation, etc.).
 *
 * Run:
 *   WORKER_MODE=true npm run worker:start
 *
 * Required env:
 *   PGBOSS_DATABASE_URL  — direct Postgres URL (NOT pgbouncer)
 *   OTEL_SERVICE_NAME    — recommended "tavli-worker" so traces attribute
 *                          to the worker process distinct from the web.
 */

import { bootstrapQueues } from "@/lib/jobs/bootstrap";
import { getBoss, stopBoss } from "@/lib/jobs/boss";

async function main(): Promise<void> {
  if (process.env.WORKER_MODE !== "true") {
    console.error(
      "scripts/worker.ts: refusing to start without WORKER_MODE=true. " +
        "This entrypoint is the pg-boss worker — the web app uses `next start`.",
    );
    process.exit(1);
  }

  const boss = await getBoss();
  await bootstrapQueues(boss);
  console.log(
    `[worker] pg-boss started (service=${process.env.OTEL_SERVICE_NAME ?? "tavli-worker"}); queues + DLQs bootstrapped; awaiting handler registrations`,
  );

  // Domain units register their handlers here as they land. Until then,
  // the boss runs maintenance + DLQ housekeeping but processes no jobs.
  // Example shape (kept as a comment so adding the first real handler is
  // a small diff):
  //
  //   await boss.work(JOBS.reservation.sendReminder24h, async (job) => {
  //     await handleReservationReminder(job.data);
  //   });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`[worker] received ${signal}, draining...`);
    try {
      await stopBoss();
      process.exit(0);
    } catch (err) {
      console.error("[worker] stop failed:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] failed to start:", err);
  process.exit(1);
});
