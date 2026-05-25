/**
 * searchDiners — Wave 3 §03 §5.1 + §5.4 sub-unit A.4.
 *
 * Plain ILIKE matching against `full_name`, `phone`, `email` scoped to the
 * caller's organization. Trigram/pg_trgm acceleration is deferred to a
 * polish commit per the Wave 3 spec.
 *
 * Returned rows expose **masked** phone + email; the consuming page MUST
 * call `revealPiiBatch` (§03 §5.5 / sub-unit B) before showing any
 * unmasked value.
 */

import "server-only";
import { and, eq, isNull, ilike, or, desc, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { diners } from "@/lib/db/schema";
import { maskPhone, maskEmail } from "./mask";

export interface SearchDinersInput {
  orgId: string;
  query: string;
  limit?: number;
  offset?: number;
}

export interface SearchDinersResult {
  id: string;
  fullName: string | null;
  phoneMasked: string;
  emailMasked: string;
  lastVisitedAt: string | null;
  visitCount: number;
}

interface Deps {
  db: typeof dbAdmin;
}

export function makeSearchDiners(deps: Deps) {
  return async function searchDiners(
    input: SearchDinersInput,
  ): Promise<SearchDinersResult[]> {
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    const q = input.query.trim();
    if (!q) return [];

    const queryLower = `%${q.toLowerCase()}%`;

    const rows = await deps.db
      .select({
        id: diners.id,
        fullName: diners.fullName,
        phone: diners.phone,
        email: diners.email,
        lastVisitedAt: diners.lastVisitedAt,
        visitCount: diners.visitCount,
      })
      .from(diners)
      .where(
        and(
          eq(diners.organizationId, input.orgId),
          isNull(diners.redactedAt),
          or(
            ilike(diners.fullName, queryLower),
            ilike(diners.phone, queryLower),
            ilike(diners.email, queryLower),
          ),
        ),
      )
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      phoneMasked: maskPhone(r.phone),
      emailMasked: maskEmail(r.email),
      lastVisitedAt: r.lastVisitedAt?.toISOString() ?? null,
      visitCount: r.visitCount,
    }));
  };
}

export const searchDiners = makeSearchDiners({ db: dbAdmin });

/**
 * Recent diners for the org (most-recently-visited first, NULLs last), masked
 * like searchDiners. Powers the diners list landing when there's no query.
 */
export function makeListRecentDiners(deps: Deps) {
  return async function listRecentDiners(input: {
    orgId: string;
    limit?: number;
  }): Promise<SearchDinersResult[]> {
    const rows = await deps.db
      .select({
        id: diners.id,
        fullName: diners.fullName,
        phone: diners.phone,
        email: diners.email,
        lastVisitedAt: diners.lastVisitedAt,
        visitCount: diners.visitCount,
      })
      .from(diners)
      .where(and(eq(diners.organizationId, input.orgId), isNull(diners.redactedAt)))
      .orderBy(sql`${diners.lastVisitedAt} DESC NULLS LAST`, desc(diners.createdAt))
      .limit(input.limit ?? 50);

    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      phoneMasked: maskPhone(r.phone),
      emailMasked: maskEmail(r.email),
      lastVisitedAt: r.lastVisitedAt?.toISOString() ?? null,
      visitCount: r.visitCount,
    }));
  };
}

export const listRecentDiners = makeListRecentDiners({ db: dbAdmin });
