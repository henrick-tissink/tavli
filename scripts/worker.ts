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
  handlePurgePiiAccessLog,
} from "@/lib/jobs/handlers/compliance";
import { runErasureVerification } from "@/lib/compliance/verify";
import {
  handlePurgePseudonymised,
  handleRecomputeDinerAggregates,
  handleFrequencyBucketRebalance,
  handleLapsedScan,
  handleBirthdayScan,
} from "@/lib/jobs/handlers/diners";
import { reconcileVenueCount } from "@/lib/multi-location/reconcile";
import { expireStaleInvitations } from "@/lib/identity/jobs/expire-stale-invitations";
import { sendReminders } from "@/lib/reservations/jobs/send-reminders";
import { autoMarkNoShow } from "@/lib/reservations/jobs/auto-mark-no-show";
import { sendPostVisitReviews } from "@/lib/reservations/jobs/send-post-visit-reviews";
import { purgeStaleUnverifiedOrgs } from "@/lib/identity/jobs/purge-stale-unverified-orgs";
import {
  handleTrialReminderDay60,
  handleTrialReminderDay75,
  handleTrialReminderDay85,
  handleReportMarketingOverage,
} from "@/lib/jobs/handlers/billing";
import { changePlanActions } from "@/lib/billing/change-plan";
import { enforceDunningTier } from "@/lib/billing/dunning";
import { refreshAggregates } from "@/lib/analytics/refresh-aggregates";
import { refreshCohorts } from "@/lib/analytics/refresh-cohorts";
import { backfillAggregates } from "@/lib/analytics/backfill-aggregates";
import { purgeStaleHourlyWindows } from "@/lib/analytics/purge-hourly";
import { runExport } from "@/lib/analytics/run-export";
import { expireStaleExports } from "@/lib/analytics/expire-stale-exports";
import { weeklySummary } from "@/lib/analytics/weekly-summary";
import { fanOutCampaign } from "@/lib/marketing/fan-out";
import { fireTriggeredCampaign } from "@/lib/marketing/fire-triggered";
import { sendMessageHandler } from "@/lib/marketing/send/production-senders";
import { computeAttribution } from "@/lib/marketing/jobs/attribution";
import { monthlyOverageBilling } from "@/lib/marketing/jobs/monthly-overage";
import { makeUsageAlert } from "@/lib/marketing/jobs/usage-alert";
import { purgeOldLinkClicks } from "@/lib/marketing/jobs/purge-link-clicks";
import { dbAdmin } from "@/lib/db/admin";
import { runMigrationImport } from "@/lib/migration/run-import";
import { sendDay7Checkin, sendDay30Checkin, sendDay60Checkin } from "@/lib/setup/checkins";
import { flagAtRiskOrgs } from "@/lib/setup/flag-at-risk";
import { refreshCurrencyRates } from "@/lib/pricing/refresh-rate";
import {
  expireOrphanIncomplete,
  archiveCancelledOrgs,
  syncStripeSubscription,
} from "@/lib/billing/billing-lifecycle";

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

  // §03 §5.3 — diner aggregate refresh. recomputeAggregates is on-demand
  // (enqueued from reservation completion); frequencyBucketRebalance recomputes
  // visit-count buckets nightly; lapsedScan emits diner.lapsed_60d on the 60-day
  // boundary (feeds the §11 §6.4 lapsed campaign). These power Pro segmentation,
  // which read empty frequency_bucket/visit_count until now.
  await boss.work(JOBS.diner.recomputeAggregates, async ([job]) => {
    await handleRecomputeDinerAggregates(job.data as { dinerId: string });
  });
  await boss.work(JOBS.diner.frequencyBucketRebalance, async () => {
    await handleFrequencyBucketRebalance();
  });
  await boss.schedule(JOBS.diner.frequencyBucketRebalance, "15 2 * * *");
  await boss.work(JOBS.diner.lapsedScan, async () => {
    await handleLapsedScan();
  });
  await boss.schedule(JOBS.diner.lapsedScan, "45 2 * * *");
  await boss.work(JOBS.diner.birthdayScan, async () => {
    await handleBirthdayScan();
  });
  await boss.schedule(JOBS.diner.birthdayScan, "0 3 * * *");

  // §02 §6 — 24h pre-arrival reminder, hourly sweep (claim-before-send guard).
  await boss.work(JOBS.reservation.sendReminder24h, async () => {
    await sendReminders();
  });
  await boss.schedule(JOBS.reservation.sendReminder24h, "0 * * * *");

  // §02 §6 / §08 §10 — auto-mark-no-show (opt-in per venue), hourly sweep;
  // atomically frees the table via validateOrClearTableAssignment.
  await boss.work(JOBS.reservation.autoMarkNoShow, async () => {
    await autoMarkNoShow();
  });
  await boss.schedule(JOBS.reservation.autoMarkNoShow, "30 * * * *");

  // §06 / §02 §6 — post-visit review request, hourly sweep (migrated off the
  // legacy /api/cron route; now venue-tz-correct).
  await boss.work(JOBS.reservation.sendPostVisitReview, async () => {
    await sendPostVisitReviews();
  });
  await boss.schedule(JOBS.reservation.sendPostVisitReview, "15 * * * *");

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

  // §03 §5.5/§8.1: purge diner PII access-log rows older than 24 months,
  // nightly at 06:00 UTC (after the other compliance purges to avoid
  // vacuum/lock contention).
  await boss.work(JOBS.compliance.purgePiiAccessLog, async () => {
    await handlePurgePiiAccessLog();
  });
  await boss.schedule(JOBS.compliance.purgePiiAccessLog, "0 6 * * *");

  // §01 §6.3/§10: expire stale staff invitations daily at 03:00 UTC.
  await boss.work(JOBS.identity.expireStaleInvitations, async () => {
    await expireStaleInvitations();
  });
  await boss.schedule(JOBS.identity.expireStaleInvitations, "0 3 * * *");

  // §01 §5.3: hard-delete orgs stuck in pending_verification >30d, daily 04:00 UTC.
  await boss.work(JOBS.identity.purgeStaleUnverifiedOrgs, async () => {
    await purgeStaleUnverifiedOrgs();
  });
  await boss.schedule(JOBS.identity.purgeStaleUnverifiedOrgs, "0 4 * * *");

  // Wave 5 sub-unit A: §09 nightly venue-count reconcile (drift backstop).
  await boss.work(JOBS.multilocation.reconcileVenueCount, async () => {
    await reconcileVenueCount();
  });

  await boss.schedule(JOBS.multilocation.reconcileVenueCount, "0 2 * * *");

  // Wave 5 sub-unit C: §12 trial reminders. NO schedule — these fire from the
  // startAfter enqueue in startSubscription (day 60/75/85 of the trial).
  await boss.work(JOBS.billing.sendReminderDay60, async ([job]) => {
    await handleTrialReminderDay60(job.data as { organizationId: string });
  });
  await boss.work(JOBS.billing.sendReminderDay75, async ([job]) => {
    await handleTrialReminderDay75(job.data as { organizationId: string });
  });
  await boss.work(JOBS.billing.sendReminderDay85, async ([job]) => {
    await handleTrialReminderDay85(job.data as { organizationId: string });
  });

  // NEW-9: consume marketing overage feed (records the overage owed + reports
  // to Stripe metered billing via the configured seam).
  await boss.work(JOBS.billing.reportMarketingOverage, async ([job]) => {
    await handleReportMarketingOverage(
      job.data as Parameters<typeof handleReportMarketingOverage>[0],
    );
  });

  // Wave 5 sub-unit F: §8.3 apply queued monthly↔annual frequency switches at
  // period end (every 30 min).
  await boss.work(JOBS.billing.applyPendingFrequencyChanges, async () => {
    await changePlanActions.applyPendingFrequencyChanges();
  });
  await boss.schedule(JOBS.billing.applyPendingFrequencyChanges, "*/30 * * * *");

  // Wave 5 sub-unit G: §11.5 dunning + §13 lifecycle jobs.
  await boss.work(JOBS.billing.enforceDunningTier, async () => {
    await enforceDunningTier();
  });
  await boss.schedule(JOBS.billing.enforceDunningTier, "0 */6 * * *"); // every 6h

  await boss.work(JOBS.billing.expireOrphanIncomplete, async () => {
    await expireOrphanIncomplete();
  });
  await boss.schedule(JOBS.billing.expireOrphanIncomplete, "0 * * * *"); // hourly

  await boss.work(JOBS.billing.archiveCancelledOrgs, async () => {
    await archiveCancelledOrgs();
  });
  await boss.schedule(JOBS.billing.archiveCancelledOrgs, "0 1 * * *"); // nightly 01:00

  await boss.work(JOBS.billing.syncStripeSubscription, async () => {
    await syncStripeSubscription();
  });
  await boss.schedule(JOBS.billing.syncStripeSubscription, "0 3 * * *"); // nightly 03:00

  // §07 analytics (Wave 6). Nightly at 01:00 UTC (~03:00/04:00 Bucharest,
  // safely past close); each handler derives venue-local business_date from
  // restaurants.timezone. Cohorts run after aggregates.
  await boss.work(JOBS.analytics.refreshAggregates, async ([job]) => {
    await refreshAggregates((job.data ?? {}) as { restaurantId?: string });
  });
  await boss.schedule(JOBS.analytics.refreshAggregates, "0 1 * * *");
  await boss.work(JOBS.analytics.refreshCohorts, async ([job]) => {
    await refreshCohorts((job.data ?? {}) as { organizationId?: string });
  });
  await boss.schedule(JOBS.analytics.refreshCohorts, "30 1 * * *");
  // Backfill is on-demand only (no schedule).
  await boss.work(JOBS.analytics.backfillAggregates, async ([job]) => {
    await backfillAggregates((job.data ?? {}) as { restaurantId?: string });
  });
  // Weekly hourly-window purge, Mondays 05:00 UTC.
  await boss.work(JOBS.analytics.purgeStaleHourlyWindows, async () => {
    await purgeStaleHourlyWindows();
  });
  await boss.schedule(JOBS.analytics.purgeStaleHourlyWindows, "0 5 * * 1");
  // Async CSV/ZIP export (on-demand) + nightly expired-export cleanup.
  await boss.work(JOBS.analytics.runExport, async ([job]) => {
    await runExport(job.data as { jobId: string });
  });
  await boss.work(JOBS.analytics.expireStaleExports, async () => {
    await expireStaleExports();
  });
  await boss.schedule(JOBS.analytics.expireStaleExports, "0 4 * * *");
  // Weekly summary digest — Sundays 18:00 UTC (~20:00/21:00 Bucharest);
  // handler derives each venue's last Mon–Sun from its timezone.
  await boss.work(JOBS.analytics.weeklySummary, async ([job]) => {
    await weeklySummary((job.data ?? {}) as { restaurantId?: string });
  });
  await boss.schedule(JOBS.analytics.weeklySummary, "0 18 * * 0");

  console.log("[worker] analytics handlers registered + refreshAggregates (0 1 * * *), refreshCohorts (30 1 * * *), purgeStaleHourlyWindows (0 5 * * 1), expireStaleExports (0 4 * * *), weeklySummary (0 18 * * 0) scheduled; runExport on-demand");

  // §11 marketing (Wave 7). Fan-out + leaf send + triggered fire are on-demand;
  // attribution every 5 min; overage 1st of month 02:00; usage-alert hourly;
  // link-click purge nightly.
  await boss.work(JOBS.marketing.fanOut, async ([job]) => {
    await fanOutCampaign(job.data as { campaignId: string; offset?: number });
  });
  await boss.work(JOBS.marketing.sendMessage, async ([job]) => {
    await sendMessageHandler(job.data as { sendId: string });
  });
  await boss.work(JOBS.marketing.fireTriggeredCampaign, async ([job]) => {
    await fireTriggeredCampaign(job.data as { triggerEvent: string; dinerId: string; organizationId: string; restaurantId?: string });
  });
  await boss.work(JOBS.marketing.computeAttribution, async () => {
    await computeAttribution();
  });
  await boss.schedule(JOBS.marketing.computeAttribution, "*/5 * * * *");
  await boss.work(JOBS.marketing.monthlyOverageBilling, async () => {
    await monthlyOverageBilling();
  });
  await boss.schedule(JOBS.marketing.monthlyOverageBilling, "0 2 1 * *");
  await boss.work(JOBS.marketing.usageAlert, async () => {
    await makeUsageAlert({
      db: dbAdmin,
      sendAlert: async ({ organizationId, channel, threshold }) =>
        console.log(`[marketing] quota alert org=${organizationId} ${channel} at ${threshold}%`),
    })();
  });
  await boss.schedule(JOBS.marketing.usageAlert, "0 * * * *");
  await boss.work(JOBS.marketing.purgeOldLinkClicks, async () => {
    await purgeOldLinkClicks();
  });
  await boss.schedule(JOBS.marketing.purgeOldLinkClicks, "45 4 * * *");

  // §14 setup — CSV migration import (on demand) + check-in sweeps + at-risk flag.
  await boss.work(JOBS.setup.runMigrationImport, async ([job]) => {
    await runMigrationImport(job.data as { importId: string });
  });
  await boss.work(JOBS.setup.sendDay7Checkin, async () => { await sendDay7Checkin(); });
  await boss.work(JOBS.setup.sendDay30Checkin, async () => { await sendDay30Checkin(); });
  await boss.work(JOBS.setup.sendDay60Checkin, async () => { await sendDay60Checkin(); });
  await boss.schedule(JOBS.setup.sendDay7Checkin, "0 8 * * *");
  await boss.schedule(JOBS.setup.sendDay30Checkin, "10 8 * * *");
  await boss.schedule(JOBS.setup.sendDay60Checkin, "20 8 * * *");
  await boss.work(JOBS.setup.flagAtRiskOrgs, async () => { await flagAtRiskOrgs(); });
  await boss.schedule(JOBS.setup.flagAtRiskOrgs, "0 9 * * *");

  // §15 pricing — daily BNR EUR/RON refresh (14:30 EEST ≈ 11:30 UTC summer).
  await boss.work(JOBS.pricing.refreshCurrencyRates, async () => { await refreshCurrencyRates(); });
  await boss.schedule(JOBS.pricing.refreshCurrencyRates, "30 11 * * *");

  console.log("[worker] marketing handlers registered + computeAttribution (*/5), monthlyOverageBilling (0 2 1 * *), usageAlert (0 * * * *), purgeOldLinkClicks (45 4 * * *) scheduled; fanOut/sendMessage/fireTriggered on-demand");

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
