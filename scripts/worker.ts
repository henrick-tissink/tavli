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
import { JOBS } from "@/lib/jobs/keys";
import {
  handleErasureExecute,
  handleErasurePartnerNotificationsPhase2,
} from "@/lib/jobs/handlers/compliance";
import { runErasureVerification } from "@/lib/compliance/verify";
import { handlePurgePseudonymised } from "@/lib/jobs/handlers/diners";

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

  await boss.work(JOBS.compliance.erasureExecute, async ([job]) => {
    await handleErasureExecute(job.data as { requestId: string });
  });

  await boss.work(JOBS.compliance.erasurePartnerNotificationsPhase2, async ([job]) => {
    await handleErasurePartnerNotificationsPhase2(job.data as { requestId: string });
  });

  await boss.work(JOBS.compliance.erasureVerify, async () => {
    await runErasureVerification();
  });

  // Wave 3 deferred follow-up: register handlePurgePseudonymised at boot.
  // handlePurgePseudonymised sweeps all diners with redacted_at > 30d — no
  // per-job payload needed; the batch query self-scopes.
  await boss.work(JOBS.diner.purgePseudonymised, async () => {
    await handlePurgePseudonymised();
  });

  // Schedule the nightly verification sweep at 03:00 UTC.
  await boss.schedule(JOBS.compliance.erasureVerify, "0 3 * * *");

  console.log("[worker] compliance handlers registered + erasureVerify scheduled (0 3 * * *)");

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
