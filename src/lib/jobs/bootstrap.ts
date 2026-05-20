/**
 * Idempotent queue + DLQ bootstrap per foundations §10.2.
 *
 * Every registered JOBS key gets:
 * - a main queue with retry/expire/deadLetter config
 * - a paired `${name}__dlq` queue that receives jobs after retries
 *   exhaust; the Tavli admin dashboard reads these for manual review.
 *
 * Called from scripts/worker.ts after getBoss() — runs once at boot
 * and is safe to re-run on every boot (createQueue is idempotent in
 * pg-boss 10).
 *
 * Per-job overrides (e.g. higher expireInMinutes for heavy compute,
 * singletonKey for fan-out dedup) land on the .work() / .send() call
 * site when domain handlers register. The bootstrap establishes the
 * floor; domains raise it when needed.
 */

import "server-only";
import type PgBoss from "pg-boss";
import { JOBS } from "./keys";

const DEFAULT_QUEUE_CONFIG = {
  retryLimit: 3,
  retryBackoff: true,
  retryDelay: 60,
  expireInMinutes: 10,
} as const;

export function dlqName(queueName: string): string {
  return `${queueName}__dlq`;
}

function flattenJobs(): string[] {
  const out: string[] = [];
  for (const domain of Object.values(JOBS)) {
    for (const name of Object.values(domain as Record<string, string>)) {
      out.push(name);
    }
  }
  return out;
}

export async function bootstrapQueues(boss: PgBoss): Promise<void> {
  const names = flattenJobs();
  for (const name of names) {
    const dlq = dlqName(name);
    // DLQ first so its existence is guaranteed before the main queue
    // references it as deadLetter target.
    await boss.createQueue(dlq);
    await boss.createQueue(name, {
      name,
      ...DEFAULT_QUEUE_CONFIG,
      deadLetter: dlq,
    });
  }
}

// Exported for the bootstrap test — verifies every JOBS key gets
// processed without round-tripping through pg-boss.
export const _allJobNames = flattenJobs;
