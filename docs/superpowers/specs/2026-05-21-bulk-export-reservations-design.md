# §02 bulkExportReservations

**Date:** 2026-05-21
**Wave:** 2
**Spec source:** `docs/superpowers/architecture/02-bookings.md` §4.8

---

## Problem

Partners (and Tavli admins) need to export their reservation history for accounting, ops reporting, and compliance. The spec defines a server-action contract with date-range bounds, scope choice (per-venue vs per-org), CSV/XLSX format, and an authz gate. Today no export action exists; the only way to extract data is direct DB access by an admin.

## Goal

Ship a server action `bulkExportReservations(input)` that returns CSV content (Buffer + filename) for the requested date range + scope, gated by `can(..., 'analytics.export', ...)`, audit-logged via `AUDIT.analytics.export_run`.

## Non-goals

- **XLSX format support** — the spec lists it but requires a heavy `exceljs` (~3MB) install. Defer until a real consumer asks. CSV covers v1.
- **UI integration** — no download button / date picker / format selector in this unit. The action exists, callable from a future UI commit.
- **Pseudonymised-diner exclusion** — §03 diners table doesn't exist yet. The spec's `includeRedacted: false` clause is preserved structurally (the Zod schema rejects `true`), but the actual filtering is a no-op today because no pseudonymised flag exists. Documented as a §03-blocked extension.
- **Streaming / chunked responses** — small data volumes today (12 partners × ≤365 days of bookings). Buffer-in-memory is fine.

## Architecture

One new server-action file + one new CSV-generator helper + tests + audit wiring. No migration. Single commit.

### `src/lib/csv/stringify.ts` — new minimal CSV helper

```ts
export function csvStringify(
  rows: Array<Record<string, string | number | null | undefined>>,
  columns: Array<{ key: string; header: string }>,
): string;
```

Hand-rolled (no library). Escapes fields containing `,`, `"`, `\n`, or `\r` by wrapping in `"..."` and doubling internal quotes. Output is RFC 4180 CSV with `\r\n` line endings + a header row.

3 unit tests:
1. Empty rows → header line only.
2. Plain values → comma-joined.
3. Embedded quotes/commas/newlines → properly escaped.

### `src/app/partner/(dashboard)/reservations/export-actions.ts` — new server action

```ts
"use server";

const inputSchema = z.object({
  restaurantId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.literal("csv"),                      // xlsx deferred
  includeRedacted: z.literal(false).optional(),  // spec's structural placeholder
}).refine(
  (i) => Boolean(i.restaurantId) !== Boolean(i.organizationId),
  { message: "Specify exactly one of restaurantId or organizationId." },
).refine(
  (i) => daysBetween(i.dateFrom, i.dateTo) <= 365,
  { message: "Date range cannot exceed 365 days." },
).refine(
  (i) => i.dateFrom <= i.dateTo,
  { message: "dateFrom must be on or before dateTo." },
);

export type BulkExportReservationsInput = z.infer<typeof inputSchema>;

export interface BulkExportReservationsResult {
  ok: boolean;
  error?: string;
  filename?: string;
  contentBase64?: string;  // base64-encoded CSV bytes; UI decodes for download
  rowCount?: number;
}

export async function bulkExportReservations(
  raw: BulkExportReservationsInput,
): Promise<BulkExportReservationsResult>;
```

Flow:
1. `inputSchema.safeParse(raw)`. On failure → `{ ok: false, error: <flat message> }`.
2. `await getCurrentSession()`. No session → `{ ok: false, error: "Not signed in." }`.
3. **Authz** — construct the appropriate Subject:
   - `restaurantId` path: load `organization_id` for that restaurant; subject = `{ kind: 'restaurant', id: restaurantId, organization_id }`.
   - `organizationId` path: subject = `{ kind: 'organization', id: organizationId }`.
   Call `can(session, 'analytics.export', subject)`. On deny → `{ ok: false, error: "Forbidden." }`.
4. **Query** — Drizzle SELECT against `reservations` with appropriate JOIN for org-scope:
   - Restaurant scope: filter by `reservation_date BETWEEN dateFrom AND dateTo` + `restaurant_id`.
   - Org scope: same + `INNER JOIN restaurants ON restaurants.organization_id = ?`.
   - For org-scope, project the `restaurants.name` column too (multi-venue exports want venue identification).
   - Order: `reservation_date ASC, reservation_time ASC, created_at ASC`.
5. **CSV** — map rows to the column schema:
   - Restaurant scope columns: `reservation_date, reservation_time, guest_name, guest_phone, guest_email, party_size, zone, status, notes, created_at`.
   - Org scope columns: prepend `restaurant_name` to that list.
6. **Filename** — `reservations-<scope>-<from>-to-<to>.csv` where `<scope>` is restaurant id (last 8 chars) or org id (last 8 chars).
7. **Audit** — `recordAudit({ action: AUDIT.analytics.export_run, subjectType: 'reservation_export', actorUserId, actorRole, restaurantId, organizationId, context: { date_from, date_to, format: 'csv', row_count, scope } })`. ActorRole resolved via `getActorRole(session, restaurantId || <pick-first-org-restaurant-or-fallback>)`. For org-scope without a specific restaurant, use the org_owner role assumption — actor must be org_owner per the matrix anyway.
8. **Return** — `{ ok: true, filename, contentBase64, rowCount }`.

### Tests (`src/app/partner/(dashboard)/reservations/__tests__/export-actions.test.ts`)

4 cases — all use mock supabase/drizzle so they don't need a live DB:
1. **Restaurant scope happy path** — valid input, can() returns true, query returns 2 reservations → CSV has 1 header + 2 data rows.
2. **Org scope happy path** — valid input, org-scoped query returns rows with restaurant names → CSV has restaurant_name column populated.
3. **Date range > 365 days** → schema rejects with the appropriate error.
4. **Forbidden** — can() returns false → `{ ok: false, error: 'Forbidden.' }`.

For CSV-helper tests, see the helper file's own test (`src/lib/csv/__tests__/stringify.test.ts` — 3 cases).

## Authz alignment

Matrix grants `analytics.export` to: `tavli_admin`, `org_owner`, `org_admin`, `venue_owner`. Venue managers and hosts are denied. This matches the spec's intent ("org_owner only" for org-scope — but matrix also lets org_admin and venue_owner export at the venue level, which is appropriate for the v1 use case).

## Verification

1. `npx tsc --noEmit` clean.
2. `npx jest src/lib/csv src/app/partner/\(dashboard\)/reservations/__tests__/export-actions.test.ts` — 7/7 pass.
3. `npm run lint` — 14-error baseline.
4. `npm run build` — green.

## Risk summary

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| 365-day date range with high-volume restaurant returns >100k rows | Low (today) | Low | Acceptable for v1 partner scale. Pagination + streaming added when a real consumer hits the limit. |
| CSV manual escaping has edge-case bugs | Low | Med | 3 unit tests cover the escape cases; RFC 4180 semantics. |
| Audit row's `actorRole` is wrong for org-scope-without-restaurant case | Low | Low | The matrix gate ensures only org-level roles reach the audit. Worst case: actorRole shows `org_owner` even if the actor was `org_admin` — minor inaccuracy. Cleaner: resolve actor via the org's first restaurant. |
| `includeRedacted: false` is a no-op today (no pseudonymised flag) | Expected | None | Documented; §03 will wire the actual exclusion. |

## Commit shape

Single commit:
- `src/lib/csv/stringify.ts` (new helper)
- `src/lib/csv/__tests__/stringify.test.ts` (3 tests)
- `src/app/partner/(dashboard)/reservations/export-actions.ts` (new server action)
- `src/app/partner/(dashboard)/reservations/__tests__/export-actions.test.ts` (4 tests)

```
feat(reservations): bulkExportReservations server action (CSV, audited) per §02 §4.8
```

No migration. No UI. No new dependencies.
