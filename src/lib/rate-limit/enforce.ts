/**
 * enforceRateLimit — §13 §9.1 Wave 4 sub-unit C.
 *
 * Fixed-window rate limiter backed by the rate_limits table. Algorithm:
 *   windowStart = floor(now / windowSeconds) * windowSeconds
 *   Atomic INSERT ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count.
 *   Allowed if returned count <= limit.
 *
 * Uses makeEnforceRateLimit(deps) for injection in tests; the exported
 * enforceRateLimit singleton wires in the real dbAdmin + system clock.
 */

import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { rateLimits } from "@/lib/db/schema";
import { RATE_LIMIT_SCOPES, type RateLimitScope } from "./scopes";

export interface EnforceRateLimitInput {
  key: string;
  scope: RateLimitScope;
}

export interface EnforceRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetsAt: Date;
}

interface Deps {
  db: typeof dbAdmin;
  now: () => Date;
}

export function makeEnforceRateLimit(deps: Deps) {
  return async function enforceRateLimit(
    input: EnforceRateLimitInput,
  ): Promise<EnforceRateLimitResult> {
    const config = RATE_LIMIT_SCOPES[input.scope];
    const nowMs = deps.now().getTime();
    const windowMs = config.windowSeconds * 1000;
    const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs);
    const windowEnd = new Date(windowStartMs + windowMs);
    // +60s buffer so cleanup job doesn't race with an in-flight window
    const expiresAt = new Date(windowEnd.getTime() + 60_000);

    const result = await deps.db.execute<{ count: number }>(sql`
      INSERT INTO rate_limits (key, scope, window_start, window_end, count, expires_at)
      VALUES (${input.key}, ${input.scope}, ${windowStart}, ${windowEnd}, 1, ${expiresAt})
      ON CONFLICT (key, window_start) DO UPDATE
        SET count = rate_limits.count + 1
      RETURNING count;
    `);

    const count =
      (result as unknown as Array<{ count: number }>)[0]?.count ?? 1;

    return {
      allowed: count <= config.limit,
      remaining: Math.max(0, config.limit - count),
      resetsAt: windowEnd,
    };
  };
}

export const enforceRateLimit = makeEnforceRateLimit({
  db: dbAdmin,
  now: () => new Date(),
});
