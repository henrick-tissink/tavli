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
  handleRetentionPurge,
  handlePurgeRateLimits,
  handlePurgeCookieConsents,
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

  // Daily sweep at 04:00 UTC (1h after erasureVerify): purge diners whose
  // redacted_at is >30 days old. The orchestrator (T14) ALSO enqueues a
  // startAfter:30d invocation per diner, but the daily sweep is the
  // reliable safety net + the only thing that picks up legacy pseudonymisations.
  await boss.schedule(JOBS.diner.purgePseudonymised, "0 4 * * *");

  // Wave 4 sub-unit B T4: register retentionPurge handler + schedule nightly.
  // Runs 30 min after purgePseudonymised to avoid vacuum/lock contention.
  await boss.work(JOBS.compliance.retentionPurge, async () => {
    await handleRetentionPurge();
  });

  await boss.schedule(JOBS.compliance.retentionPurge, "30 4 * * *");

  // Wave 4 sub-unit C: register purgeRateLimits handler + schedule nightly.
  // Runs 30 min after retentionPurge to avoid vacuum/lock contention.
  await boss.work(JOBS.compliance.purgeRateLimits, async () => {
    await handlePurgeRateLimits();
  });

  await boss.schedule(JOBS.compliance.purgeRateLimits, "0 5 * * *");

  // Wave 4 sub-unit D: register purgeCookieConsents handler + schedule nightly.
  // Runs 30 min after purgeRateLimits to avoid vacuum/lock contention.
  await boss.work(JOBS.compliance.purgeCookieConsents, async () => {
    await handlePurgeCookieConsents();
  });

  await boss.schedule(JOBS.compliance.purgeCookieConsents, "30 5 * * *");

  console.log("[worker] compliance handlers registered + erasureVerify scheduled (0 3 * * *); purgePseudonymised scheduled (0 4 * * *); retentionPurge scheduled (30 4 * * *); purgeRateLimits scheduled (0 5 * * *); purgeCookieConsents scheduled (30 5 * * *)");

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
