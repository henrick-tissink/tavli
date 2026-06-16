# Corporate Orders (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a diner tag a standard reservation to a company by CUI in the public booking sheet; the venue sees company-tagged reservations (badge + filter) and a per-company roll-up.

**Architecture:** Claim-only, mirroring the events pipeline. The booking sheet captures a CUI (shared ANAF lookup field); on commit the server validates format, re-checks the venue capability flag, best-effort enriches via ANAF, find-or-creates a `corporate_clients` row (deduped on a canonical digits-only CUI), and sets `reservations.corporate_client_id`. No migration — every column already exists.

**Tech Stack:** Next.js (App Router, server actions), React client components, drizzle (`dbAdmin`) + Supabase JS client, Jest, custom i18n (`useT` / `getMessages`, 3 locales ro/en/de).

**Spec:** `docs/superpowers/specs/2026-06-16-corporate-orders-design.md`

**Prod-DB hazard (read before running tests):** `.env.local` points at **prod**. Never run the full jest suite. Run integration/node tests only by name with local env sourced:
`set -a && source .env.local.bak && set +a && npx jest -t "<test name>"`. Pure/jsdom unit tests (no DB) can run normally by file path. Jest path globs break on `(app)`/`(dashboard)` parens — filter by `-t`.

---

## File Structure

**Create:**
- `src/components/corporate/CuiLookupField.tsx` — shared, i18n-agnostic ANAF CUI lookup field (moved from events).
- `src/lib/reservations/corporate-upsert.ts` — pure helper: choose company-row fields from ANAF result vs client input.
- `src/lib/reservations/__tests__/corporate-upsert.test.ts`
- `src/app/(app)/partner/(dashboard)/corporate/companies/page.tsx` — read-only per-company roll-up.

**Modify:**
- `src/lib/integrations/anaf.ts` — add `canonicalCui`.
- `src/lib/repos/corporate-clients-repo.ts` — key find-or-create on `canonicalCui`; accept ANAF fields.
- `src/lib/repos/__tests__/corporate-clients-repo.test.ts` — cleanup + dedup test.
- `src/lib/reservations/booking-commit.ts` — `CommitInput.corporateClientId` + insert.
- `src/app/api/reservations/actions.ts` — `companyCui`/`companyName`, resolution before commit.
- `src/app/api/reservations/__tests__/actions.test.ts` — company-path cases + mock plumbing.
- `src/components/event-request-sheet-v2/StepIdentity.tsx` — use shared field + `labels`.
- `src/components/reservation-sheet-v2/types.ts` — form-state company fields.
- `src/components/reservation-sheet-v2/index.tsx` — `acceptsCorporateMeals` prop, `onPatch`, submit.
- `src/components/reservation-sheet-v2/StepIdentity.tsx` — company toggle + shared field.
- `src/components/reservation-sheet-v2/__tests__/index.test.tsx` — company toggle behaviour.
- `src/lib/types.ts` — `acceptsCorporateMeals?` on restaurant detail.
- `src/lib/repos/restaurants-repo.ts` — select + map the flag.
- `src/app/(public)/[lang]/[city]/(shell)/[slug]/DetailPageClient.tsx` — pass flag to sheet.
- `src/components/partner/ReservationsList.tsx` — `corporateClientName`, badge, "Corporate only" filter.
- `src/app/(app)/partner/(dashboard)/reservations/page.tsx` — select id + resolve name.
- `src/lib/repos/corporate-clients-repo.ts` — add `listCorporateClientsForRestaurant` (same file as above).
- `src/components/partner/CorporateOverview.tsx` — flip card, footer block, count.
- `src/app/(app)/partner/(dashboard)/corporate/page.tsx` — pass count.
- `src/lib/i18n/messages.ts` — extend `BookingMessages`, `PartnerReservationsMessages`, `PartnerCorporateMessages`.
- `src/messages/{ro,en,de}/booking.json`, `partner.reservations.json`, `partner.corporate.json`.

---

## Task 1: `canonicalCui` + repo dedup

**Files:**
- Modify: `src/lib/integrations/anaf.ts`
- Modify: `src/lib/repos/corporate-clients-repo.ts`
- Test: `src/lib/integrations/__tests__/anaf.test.ts`, `src/lib/repos/__tests__/corporate-clients-repo.test.ts`

- [ ] **Step 1: Write the failing unit test for `canonicalCui`**

Append to `src/lib/integrations/__tests__/anaf.test.ts` (inside the file, new `describe`):

```ts
import { canonicalCui } from "../anaf";

describe("canonicalCui", () => {
  it("strips the RO prefix and trims so RO-prefixed and bare CUIs match", () => {
    expect(canonicalCui(" ro12345678 ")).toBe("12345678");
    expect(canonicalCui("12345678")).toBe("12345678");
    expect(canonicalCui("RO12345678")).toBe(canonicalCui("12345678"));
  });
});
```

- [ ] **Step 2: Run it, expect fail**

Run: `npx jest src/lib/integrations/__tests__/anaf.test.ts -t "canonicalCui"`
Expected: FAIL — `canonicalCui` is not exported.

- [ ] **Step 3: Add `canonicalCui` to `anaf.ts`**

In `src/lib/integrations/anaf.ts`, just below `isValidCuiFormat` (after line 21), add (and you may delete the now-redundant private `digitsOnly`, replacing its use in `lookupCui` with `canonicalCui`):

```ts
/**
 * Canonical storage/dedup key for a CUI: digits-only (RO prefix stripped),
 * matching ANAF's numeric identity. Use this — NOT normalizeCui — as the
 * unique key for corporate_clients so "RO12345678" and "12345678" dedupe.
 */
export function canonicalCui(input: string): string {
  return normalizeCui(input).replace(/^RO/, "");
}
```

In `lookupCui`, replace `Number(digitsOnly(cui))` with `Number(canonicalCui(cui))` and remove the `digitsOnly` function.

- [ ] **Step 4: Run, expect pass (and existing anaf tests still pass)**

Run: `npx jest src/lib/integrations/__tests__/anaf.test.ts`
Expected: PASS (including the unchanged `normalizeCui` assertions).

- [ ] **Step 5: Switch repo to `canonicalCui` + write dedup test**

In `src/lib/repos/corporate-clients-repo.ts`: **replace** the `normalizeCui` import with `canonicalCui` (normalizeCui is no longer used here — leaving it imported is an unused-import lint error), and swap both call sites:

```ts
import { canonicalCui } from "@/lib/integrations/anaf";
// findCorporateClientByCui:
const normalized = canonicalCui(cui);
// insertPendingCorporateClient:
const cui = canonicalCui(input.cui);
```

In `src/lib/repos/__tests__/corporate-clients-repo.test.ts`: change the cleanup to also match the canonical (RO-stripped) form, and add a dedup test:

```ts
beforeEach(async () => {
  await dbAdmin.execute(`DELETE FROM corporate_clients WHERE cui LIKE '%TEST%' OR cui IN ('99990001')`);
});

it("dedupes RO-prefixed and bare CUIs to one row", async () => {
  const a = await insertPendingCorporateClient({ cui: "RO99990001", name: "Acme SRL" });
  const b = await insertPendingCorporateClient({ cui: "99990001", name: "Acme SRL" });
  expect(b.id).toBe(a.id);
  expect(a.cui).toBe("99990001");
});
```

- [ ] **Step 6: Run repo tests (local DB sourced) and expect pass**

Run: `set -a && source .env.local.bak && set +a && npx jest -t "dedupes RO-prefixed"`
Then: `set -a && source .env.local.bak && set +a && npx jest -t "insertPendingCorporateClient creates a pending_verification row"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/integrations/anaf.ts src/lib/integrations/__tests__/anaf.test.ts src/lib/repos/corporate-clients-repo.ts src/lib/repos/__tests__/corporate-clients-repo.test.ts
git commit -m "feat(corporate): canonical CUI dedup key for corporate_clients find-or-create"
```

---

## Task 2: Pure company-upsert decision helper

**Files:**
- Create: `src/lib/reservations/corporate-upsert.ts`
- Test: `src/lib/reservations/__tests__/corporate-upsert.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/reservations/__tests__/corporate-upsert.test.ts`:

```ts
import { buildCorporateUpsert } from "../corporate-upsert";
import type { CuiLookupResult } from "@/lib/integrations/anaf";

const cui = "RO12345678";

describe("buildCorporateUpsert", () => {
  it("uses ANAF data when the lookup found the company", () => {
    const anaf: CuiLookupResult = {
      ok: true, found: true, cui, name: "ANAF NAME SRL",
      legalName: "ANAF NAME SRL", address: "Str. X 1, Bucuresti", vatPayer: true,
    };
    expect(buildCorporateUpsert(cui, anaf, "Typed Name")).toEqual({
      cui, name: "ANAF NAME SRL", legalName: "ANAF NAME SRL",
      billingAddress: "Str. X 1, Bucuresti", vatPayer: true,
    });
  });

  it("falls back to the client name when ANAF is down (ok:false)", () => {
    const anaf: CuiLookupResult = { ok: false, found: false, cui };
    expect(buildCorporateUpsert(cui, anaf, "Typed Name")).toEqual({ cui, name: "Typed Name" });
  });

  it("falls back to the client name when ANAF returns not-found", () => {
    const anaf: CuiLookupResult = { ok: true, found: false, cui };
    expect(buildCorporateUpsert(cui, anaf, "Typed Name")).toEqual({ cui, name: "Typed Name" });
  });

  it("uses the client name when ANAF found the company but returned no name", () => {
    const anaf: CuiLookupResult = { ok: true, found: true, cui, address: "Str. Y 2" };
    expect(buildCorporateUpsert(cui, anaf, "Typed Name")).toEqual({
      cui, name: "Typed Name", legalName: undefined, billingAddress: "Str. Y 2", vatPayer: undefined,
    });
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npx jest src/lib/reservations/__tests__/corporate-upsert.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/reservations/corporate-upsert.ts`:

```ts
import type { CuiLookupResult } from "@/lib/integrations/anaf";

export interface CorporateUpsertInput {
  cui: string;
  name: string;
  legalName?: string;
  billingAddress?: string;
  vatPayer?: boolean;
}

/**
 * Best-effort enrichment: when ANAF resolved the company, prefer its canonical
 * name + legal name / address / VAT status; otherwise fall back to the
 * client-supplied name. The company is always upserted at pending_verification
 * (the repo sets the status); ANAF availability never blocks the booking.
 */
export function buildCorporateUpsert(
  cui: string,
  anaf: CuiLookupResult,
  clientName: string,
): CorporateUpsertInput {
  if (anaf.found) {
    return {
      cui,
      name: anaf.name ?? clientName,
      legalName: anaf.legalName,
      billingAddress: anaf.address,
      vatPayer: anaf.vatPayer,
    };
  }
  return { cui, name: clientName };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx jest src/lib/reservations/__tests__/corporate-upsert.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reservations/corporate-upsert.ts src/lib/reservations/__tests__/corporate-upsert.test.ts
git commit -m "feat(corporate): pure helper choosing company fields from ANAF vs client input"
```

---

## Task 3: Thread `corporateClientId` through `commitFloorBooking`

**Files:**
- Modify: `src/lib/reservations/booking-commit.ts:108` (CommitInput) and `:164` (insert)

- [ ] **Step 1: Add the field to `CommitInput`**

In `src/lib/reservations/booking-commit.ts`, add to the `CommitInput` interface (after `notes`):

```ts
  notes: string | null;
  corporateClientId: string | null;
  confirmationToken: string;
```

- [ ] **Step 2: Set it on the reservation insert**

In the `tx.insert(reservations).values({ ... })` block (~line 166), add:

```ts
          notes: input.notes,
          corporateClientId: input.corporateClientId,
          status: "confirmed",
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors only at `createReservation`'s `commitFloorBooking({...})` call (missing `corporateClientId`) — fixed in Task 4. No errors inside `booking-commit.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/reservations/booking-commit.ts
git commit -m "feat(corporate): accept corporateClientId in commitFloorBooking insert"
```

---

## Task 4: `createReservation` company resolution

**Files:**
- Modify: `src/app/api/reservations/actions.ts`
- Test: `src/app/api/reservations/__tests__/actions.test.ts`

- [ ] **Step 1: Add failing tests for the company path**

In `src/app/api/reservations/__tests__/actions.test.ts`:

Add module mocks near the other `jest.mock` calls (after line 64):

```ts
jest.mock("@/lib/integrations/anaf", () => ({
  ...jest.requireActual("@/lib/integrations/anaf"),
  lookupCui: jest.fn(),
}));
jest.mock("@/lib/repos/corporate-clients-repo", () => ({
  insertPendingCorporateClient: jest.fn().mockResolvedValue({ id: "corp-1" }),
}));
```

Add imports (after line 72):

```ts
import { lookupCui } from "@/lib/integrations/anaf";
import { insertPendingCorporateClient } from "@/lib/repos/corporate-clients-repo";
```

In `setupSupabaseAdmin`, extend the `restaurants` mock data so the flag is present (default true; allow override):

```ts
function setupSupabaseAdmin(opts: { organizationId?: string | null; acceptsCorporateMeals?: boolean } = {}) {
  const orgId = opts.organizationId === undefined ? "org-1" : opts.organizationId;
  const acceptsCorporateMeals = opts.acceptsCorporateMeals ?? true;
```

and in the `table === "restaurants"` branch, add `accepts_corporate_meals: acceptsCorporateMeals` to the returned `data` object.

Add tests inside the `describe`:

```ts
it("tags corporate_client_id when company fields + flag are present (ANAF found)", async () => {
  setupSupabaseAdmin();
  (getCurrentSession as jest.Mock).mockResolvedValue(null);
  (lookupCui as jest.Mock).mockResolvedValue({ ok: true, found: true, cui: "12345678", name: "ANAF SRL", legalName: "ANAF SRL", address: "Str. X", vatPayer: true });

  const r = await createReservation({
    restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 2,
    guestName: "A", guestPhone: "+40712345678",
    companyCui: "RO12345678", companyName: "Typed",
  });
  expect(r.ok).toBe(true);
  expect(insertPendingCorporateClient).toHaveBeenCalledWith(
    expect.objectContaining({ cui: "RO12345678", name: "ANAF SRL", billingAddress: "Str. X", vatPayer: true }),
  );
  expect(commitFloorBooking).toHaveBeenCalledWith(expect.objectContaining({ corporateClientId: "corp-1" }));
});

it("does NOT tag when the venue flag is off", async () => {
  setupSupabaseAdmin({ acceptsCorporateMeals: false });
  (getCurrentSession as jest.Mock).mockResolvedValue(null);

  const r = await createReservation({
    restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 2,
    guestName: "A", guestPhone: "+40712345678", companyCui: "RO12345678", companyName: "Typed",
  });
  expect(r.ok).toBe(true);
  expect(insertPendingCorporateClient).not.toHaveBeenCalled();
  expect(commitFloorBooking).toHaveBeenCalledWith(expect.objectContaining({ corporateClientId: null }));
});

it("rejects a malformed company CUI (non-silent)", async () => {
  setupSupabaseAdmin();
  (getCurrentSession as jest.Mock).mockResolvedValue(null);

  const r = await createReservation({
    restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 2,
    guestName: "A", guestPhone: "+40712345678", companyCui: "NOT-A-CUI", companyName: "Typed",
  });
  expect(r).toMatchObject({ ok: false, errorCode: "OTHER" });
  expect(commitFloorBooking).not.toHaveBeenCalled();
});

it("books standard (corporateClientId null) when no company fields are sent", async () => {
  setupSupabaseAdmin();
  (getCurrentSession as jest.Mock).mockResolvedValue(null);
  const r = await createReservation({
    restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 2,
    guestName: "A", guestPhone: "+40712345678",
  });
  expect(r.ok).toBe(true);
  expect(commitFloorBooking).toHaveBeenCalledWith(expect.objectContaining({ corporateClientId: null }));
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npx jest src/app/api/reservations/__tests__/actions.test.ts -t "corporate"`
Expected: FAIL — `companyCui` not on input / `corporateClientId` not passed.

- [ ] **Step 3: Implement in `actions.ts`**

Add to `CreateReservationInput` (after `smsConsent?`):

```ts
  smsConsent?: boolean;
  /** Phase 3 corporate orders — optional company tag (claim-only). */
  companyCui?: string;
  companyName?: string;
```

Add imports at the top:

```ts
import { isValidCuiFormat, lookupCui } from "@/lib/integrations/anaf";
import { insertPendingCorporateClient } from "@/lib/repos/corporate-clients-repo";
import { buildCorporateUpsert } from "@/lib/reservations/corporate-upsert";
```

After `const admin = createSupabaseAdminClient();` (line 105) and before `commitFloorBooking`, insert the resolution block:

```ts
  // §Phase3 corporate orders — resolve an optional company tag (claim-only).
  // Format-validate (non-silent), re-check the venue flag, best-effort ANAF
  // enrich, find-or-create the company. Done outside the floor transaction:
  // the company row is a benign deduped global record.
  let corporateClientId: string | null = null;
  const companyCui = input.companyCui?.trim();
  if (companyCui) {
    if (!isValidCuiFormat(companyCui)) {
      return { ok: false, mode: "db", error: "Invalid company code (CUI).", errorCode: "OTHER" };
    }
    const { data: flagRow } = await admin
      .from("restaurants")
      .select("accepts_corporate_meals")
      .eq("id", input.restaurantId)
      .maybeSingle();
    if (flagRow?.accepts_corporate_meals) {
      const anaf = await lookupCui(companyCui);
      const upsert = buildCorporateUpsert(companyCui, anaf, input.companyName?.trim() || companyCui);
      const company = await insertPendingCorporateClient(upsert);
      corporateClientId = company.id;
    }
  }
```

Add `corporateClientId,` to the `commitFloorBooking({ ... })` call (after `notes:`):

```ts
    notes: input.notes?.trim() || null,
    corporateClientId,
    confirmationToken,
```

- [ ] **Step 4: Run, expect pass**

Run: `npx jest src/app/api/reservations/__tests__/actions.test.ts`
Expected: PASS (all old + new cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reservations/actions.ts src/app/api/reservations/__tests__/actions.test.ts
git commit -m "feat(corporate): resolve + tag corporate_client_id in createReservation"
```

---

## Task 5: Extract & generalise `CuiLookupField`

**Files:**
- Create: `src/components/corporate/CuiLookupField.tsx`
- Delete: `src/components/event-request-sheet-v2/CuiLookupField.tsx`
- Modify: `src/components/event-request-sheet-v2/StepIdentity.tsx`

- [ ] **Step 1: Create the shared, i18n-agnostic component**

Create `src/components/corporate/CuiLookupField.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export interface CuiLookupLabels {
  fieldLabel: string;
  placeholder: string;
  searchingAriaLabel: string;
  foundAriaLabel: string;
  /** Prefix shown for a previously-resolved name when no live panel is shown. */
  resolvedPrefix: string;
}

interface Props {
  cui: string;
  name: string;
  onChange: (p: { cui: string; name?: string }) => void;
  labels: CuiLookupLabels;
}

interface LookupResult {
  denumire?: string;
  adresa?: string;
}

/**
 * Debounced live ANAF CUI lookup. Calls /api/anaf/lookup ~500ms after the
 * input settles. On success, surfaces the company name + address and bubbles
 * the resolved name up. i18n-agnostic: all strings come via `labels`.
 */
export function CuiLookupField({ cui, name, onChange, labels }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cui || cui.replace(/^RO/i, "").length < 4) {
      setResult(null);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/anaf/lookup?cui=${encodeURIComponent(cui)}`);
        const json = (await res.json()) as { ok?: boolean; denumire?: string; adresa?: string };
        if (json.ok) {
          setResult({ denumire: json.denumire, adresa: json.adresa });
          if (json.denumire) onChange({ cui, name: json.denumire });
        } else {
          setResult(null);
        }
      } catch {
        setResult(null);
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cui]);

  return (
    <div>
      <label className="block">
        <span className="text-sm font-medium text-text-primary">{labels.fieldLabel}</span>
        <div className="relative">
          <input
            value={cui}
            placeholder={labels.placeholder}
            onChange={(e) => onChange({ cui: e.target.value.trim() })}
            className="w-full mt-1 border border-border rounded-card p-2 pr-9 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {loading && (
              <Loader2 className="w-4 h-4 animate-spin text-text-muted" aria-label={labels.searchingAriaLabel} />
            )}
            {!loading && result?.denumire && (
              <CheckCircle2 className="w-4 h-4 text-[color:var(--color-occasion-product)]" aria-label={labels.foundAriaLabel} />
            )}
          </span>
        </div>
      </label>
      {result?.denumire && (
        <p className="mt-1.5 text-xs bg-[color:var(--color-occasion-product-soft)] rounded p-2">
          <strong className="text-text-primary">{result.denumire}</strong>
          {result.adresa ? (
            <>
              <br />
              <span className="text-text-secondary">{result.adresa}</span>
            </>
          ) : null}
        </p>
      )}
      {name && !result && (
        <p className="mt-1 text-xs text-text-secondary">
          {labels.resolvedPrefix}
          {name}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete the old component (after confirming no other importers)**

```bash
rg -n "event-request-sheet-v2/CuiLookupField" src   # expect: only StepIdentity (updated next) — update any other hit too
git rm src/components/event-request-sheet-v2/CuiLookupField.tsx
```

- [ ] **Step 3: Update the events `StepIdentity` call site**

In `src/components/event-request-sheet-v2/StepIdentity.tsx`:

Change the import (line 5):

```tsx
import { CuiLookupField } from "@/components/corporate/CuiLookupField";
```

Replace the `<CuiLookupField .../>` block (lines 115–121) with:

```tsx
      {draft.bookingForCompany && (
        <CuiLookupField
          cui={draft.claimedCompanyCui}
          name={draft.claimedCompanyName}
          onChange={(p) =>
            onChange({
              claimedCompanyCui: p.cui,
              ...(p.name !== undefined ? { claimedCompanyName: p.name } : {}),
            })
          }
          labels={{
            fieldLabel: "CUI",
            placeholder: "RO12345678",
            searchingAriaLabel: t("cuiLookup.searchingAriaLabel"),
            foundAriaLabel: t("cuiLookup.foundAriaLabel"),
            resolvedPrefix: t("cuiLookup.denumirePrefix"),
          }}
        />
      )}
```

- [ ] **Step 4: Type-check + run events sheet tests**

Run: `npx tsc --noEmit`
Run: `npx jest src/components/event-request-sheet-v2`
Expected: PASS (events behaviour unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/components/corporate/CuiLookupField.tsx src/components/event-request-sheet-v2/StepIdentity.tsx
git commit -m "refactor(corporate): extract shared i18n-agnostic CuiLookupField"
```

---

## Task 6: Plumb `acceptsCorporateMeals` to the public restaurant model

**Files:**
- Modify: `src/lib/types.ts:266`
- Modify: `src/lib/repos/restaurants-repo.ts:160,268`

- [ ] **Step 1: Add to the restaurant detail type**

In `src/lib/types.ts`, after line 266 (`acceptsMeetingSpaces?: boolean;`) add:

```ts
  acceptsMeetingSpaces?: boolean;
  acceptsCorporateMeals?: boolean;
```

- [ ] **Step 2: Select + map the column**

In `src/lib/repos/restaurants-repo.ts`, add `accepts_corporate_meals` to the select string at ~line 160 (append after `accepts_meeting_spaces`):

```ts
      "id, slug, name, cuisines, zone, price_level, rating, vote_count, photo_count, status, lat, lng, description, hero_note, address, tags, website_url, schedule, events_intake_enabled, accepts_meeting_spaces, accepts_corporate_meals",
```

And in `restaurantFromRow` near line 268, after the `acceptsMeetingSpaces` map line add:

```ts
    acceptsMeetingSpaces: Boolean(data.accepts_meeting_spaces),
    acceptsCorporateMeals: Boolean(data.accepts_corporate_meals),
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/repos/restaurants-repo.ts
git commit -m "feat(corporate): expose acceptsCorporateMeals on the public restaurant model"
```

---

## Task 7: Booking-sheet company toggle

**Files:**
- Modify: `src/components/reservation-sheet-v2/types.ts`
- Modify: `src/components/reservation-sheet-v2/index.tsx`
- Modify: `src/components/reservation-sheet-v2/StepIdentity.tsx`
- Modify: `src/app/(public)/[lang]/[city]/(shell)/[slug]/DetailPageClient.tsx:410`
- Test: `src/components/reservation-sheet-v2/__tests__/index.test.tsx`

- [ ] **Step 1: Add form-state fields**

In `src/components/reservation-sheet-v2/types.ts`, add to `ReservationFormState` (after `occasionDate`):

```ts
  occasionDate: string;
  // Phase 3 corporate orders — claim-only company tag.
  bookingForCompany: boolean;
  companyCui: string;
  companyName: string;
```

- [ ] **Step 2: Seed them + thread prop/patch/submit in `index.tsx`**

In `makeInitialForm` add: `bookingForCompany: false, companyCui: "", companyName: "",`.

Add `acceptsCorporateMeals?: boolean;` to `ReservationSheetV2Props` and destructure it in the component signature (default not needed; treat falsy as off).

Pass it + the company fields + the full `patch` to `StepIdentity` (replace the existing `<StepIdentity ... />` props block ~line 327):

```tsx
              <StepIdentity
                date={form.date}
                slot={form.slot!}
                guests={form.guests}
                zone={form.zone}
                name={form.name}
                phone={form.phone}
                email={form.email}
                notes={form.notes}
                occasion={form.occasion}
                occasionDate={form.occasionDate}
                onChange={patchField}
                errors={errors}
                acceptsCorporateMeals={Boolean(acceptsCorporateMeals)}
                bookingForCompany={form.bookingForCompany}
                companyCui={form.companyCui}
                companyName={form.companyName}
                onPatch={patch}
              />
```

In `handleSubmit`, add the company args to the `createReservation({...})` call (after `occasionDate:`), gating on a valid format:

```ts
        occasionDate: form.occasionDate || undefined,
        companyCui:
          form.bookingForCompany && isValidCuiFormat(form.companyCui)
            ? form.companyCui
            : undefined,
        companyName:
          form.bookingForCompany && isValidCuiFormat(form.companyCui)
            ? form.companyName || undefined
            : undefined,
```

Add the import at the top of `index.tsx`:

```ts
import { isValidCuiFormat } from "@/lib/integrations/anaf";
```

- [ ] **Step 3: Render the toggle in `StepIdentity`**

In `src/components/reservation-sheet-v2/StepIdentity.tsx`:

Add the import and a `Partial` form-state type alias at top:

```tsx
import { CuiLookupField } from "@/components/corporate/CuiLookupField";
import type { OccasionKind, ReservationFormState } from "./types";
```

Extend `StepIdentityProps` (add after `errors`):

```ts
  errors: Partial<Record<"name" | "phone" | "email" | "notes", string>>;
  acceptsCorporateMeals: boolean;
  bookingForCompany: boolean;
  companyCui: string;
  companyName: string;
  onPatch: (p: Partial<ReservationFormState>) => void;
```

Destructure the new props in the function signature. Then, just before the closing `</div>` of the component (after the Notes block, before line 212's `</div>`), add:

```tsx
      {acceptsCorporateMeals && (
        <div className="space-y-2 border-t border-border pt-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <input
              type="checkbox"
              checked={bookingForCompany}
              onChange={(e) => onPatch({ bookingForCompany: e.target.checked })}
            />
            {t("sheet.stepIdentity.companyToggleLabel")}
          </label>
          {bookingForCompany && (
            <CuiLookupField
              cui={companyCui}
              name={companyName}
              onChange={(p) =>
                onPatch({
                  companyCui: p.cui,
                  ...(p.name !== undefined ? { companyName: p.name } : {}),
                })
              }
              labels={{
                fieldLabel: t("sheet.stepIdentity.companyCui.fieldLabel"),
                placeholder: t("sheet.stepIdentity.companyCui.placeholder"),
                searchingAriaLabel: t("sheet.stepIdentity.companyCui.searchingAriaLabel"),
                foundAriaLabel: t("sheet.stepIdentity.companyCui.foundAriaLabel"),
                resolvedPrefix: t("sheet.stepIdentity.companyCui.resolvedPrefix"),
              }}
            />
          )}
        </div>
      )}
```

- [ ] **Step 4: Pass the flag from the venue page**

In `…/[slug]/DetailPageClient.tsx`, add to the `<ReservationSheetV2 ... />` mount (after `maxPartySize=...`, ~line 421):

```tsx
        maxPartySize={restaurant.maxOnlinePartySize ?? undefined}
        acceptsCorporateMeals={Boolean(restaurant.acceptsCorporateMeals)}
```

- [ ] **Step 5: Write the component test (standalone, StepIdentity-level)**

Create `src/components/reservation-sheet-v2/__tests__/StepIdentity.company.test.tsx`. Mock `useT` so it echoes keys (no provider needed), then assert the toggle renders only when the flag is on:

```tsx
import { render, screen } from "@testing-library/react";
import { StepIdentity } from "../StepIdentity";

jest.mock("@/lib/i18n/messages-provider", () => ({
  useT: () => (key: string) => key,
}));

const base = {
  date: "2026-08-01", slot: "19:00", guests: 2, zone: null,
  name: "A", phone: "+40712345678", email: "", notes: "",
  occasion: "" as const, occasionDate: "",
  onChange: jest.fn(), errors: {},
  bookingForCompany: false, companyCui: "", companyName: "", onPatch: jest.fn(),
};

it("renders the company toggle only when acceptsCorporateMeals is true", () => {
  const { rerender } = render(<StepIdentity {...base} acceptsCorporateMeals={false} />);
  expect(screen.queryByText("sheet.stepIdentity.companyToggleLabel")).toBeNull();

  rerender(<StepIdentity {...base} acceptsCorporateMeals={true} />);
  expect(screen.getByText("sheet.stepIdentity.companyToggleLabel")).toBeInTheDocument();
});
```

Run: `npx jest src/components/reservation-sheet-v2/__tests__/StepIdentity.company.test.tsx`
Expected: FAIL before Step 3's render code, PASS after.

- [ ] **Step 6: Run jsdom tests + type-check**

Run: `npx jest src/components/reservation-sheet-v2`
Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/reservation-sheet-v2 "src/app/(public)/[lang]/[city]/(shell)/[slug]/DetailPageClient.tsx"
git commit -m "feat(corporate): company toggle + CUI lookup in the public booking sheet"
```

---

## Task 8: Partner reservations — corporate badge + filter

**Files:**
- Modify: `src/app/(app)/partner/(dashboard)/reservations/page.tsx`
- Modify: `src/components/partner/ReservationsList.tsx`

- [ ] **Step 1: Fetch + resolve the company name (page.tsx)**

In `reservations/page.tsx`: add `corporate_client_id` to the `cols` string (line 38). Immediately before `const mapRow = ...` (~line 91, after `resolveTable` is defined), add company-name resolution:

```ts
  const companyIds = [
    ...new Set(rawRows.map((r) => r.corporate_client_id).filter(Boolean) as string[]),
  ];
  const { data: companyRows } = companyIds.length
    ? await supabase.from("corporate_clients").select("id, name").in("id", companyIds)
    : { data: [] as { id: string; name: string }[] };
  const companyName = new Map((companyRows ?? []).map((c) => [c.id as string, c.name as string]));
```

Extend `mapRow` to set the name:

```ts
    status: r.status,
    createdAt: r.created_at,
    corporateClientName: r.corporate_client_id ? companyName.get(r.corporate_client_id) ?? null : null,
```

- [ ] **Step 2: Add the field + badge + filter (ReservationsList.tsx)**

Add to `ReservationRow` (after `createdAt`):

```ts
  createdAt: string;
  corporateClientName: string | null;
```

Add filter state after the `tab` state (line 54):

```ts
  const [corporateOnly, setCorporateOnly] = useState(false);
```

Replace `const rows = { today, upcoming, past }[tab];` with:

```ts
  const allRows = { today, upcoming, past }[tab];
  const rows = corporateOnly ? allRows.filter((r) => r.corporateClientName) : allRows;
```

Add the filter toggle just below the tab bar `</div>` (after line 98):

```tsx
      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={corporateOnly}
          onChange={(e) => setCorporateOnly(e.target.checked)}
        />
        {t("filters.corporateOnly")}
      </label>
```

In the client cell (after the guest name `<p>`, ~line 144), add the badge:

```tsx
                      {r.corporateClientName && (
                        <span className="mt-0.5 inline-block rounded-pill bg-brand-primary-soft px-2 py-0.5 text-[11px] font-semibold text-brand-primary-dark">
                          {t("badge.corporate")} · {r.corporateClientName}
                        </span>
                      )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (the i18n keys `filters.corporateOnly`/`badge.corporate` are added in Task 11; `useT` returns strings so this type-checks now, but the keys must exist before the parity test in Task 11).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/partner/(dashboard)/reservations/page.tsx" src/components/partner/ReservationsList.tsx
git commit -m "feat(corporate): company badge + Corporate-only filter on partner reservations"
```

---

## Task 9: Per-company roll-up

**Files:**
- Modify: `src/lib/repos/corporate-clients-repo.ts` (add `listCorporateClientsForRestaurant`)
- Create: `src/app/(app)/partner/(dashboard)/corporate/companies/page.tsx`
- Test: `src/lib/repos/__tests__/corporate-clients-repo.test.ts`

- [ ] **Step 1: Failing repo test**

Add to `corporate-clients-repo.test.ts`:

```ts
import { listCorporateClientsForRestaurant } from "../corporate-clients-repo";

it("listCorporateClientsForRestaurant returns [] for a restaurant with no corporate reservations", async () => {
  const rows = await listCorporateClientsForRestaurant("00000000-0000-0000-0000-000000000000");
  expect(Array.isArray(rows)).toBe(true);
  expect(rows.length).toBe(0);
});
```

- [ ] **Step 2: Run, expect fail**

Run: `set -a && source .env.local.bak && set +a && npx jest -t "listCorporateClientsForRestaurant returns"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement the repo query**

Add to `src/lib/repos/corporate-clients-repo.ts`:

```ts
import { reservations } from "@/lib/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";

export interface CorporateClientRollup {
  id: string;
  name: string;
  cui: string;
  status: CorporateClientRow["status"];
  reservationCount: number;
}

/** Companies appearing on a given restaurant's reservations, with counts. */
export async function listCorporateClientsForRestaurant(
  restaurantId: string,
): Promise<CorporateClientRollup[]> {
  const rows = await dbAdmin
    .select({
      id: corporateClients.id,
      name: corporateClients.name,
      cui: corporateClients.cui,
      status: corporateClients.status,
      reservationCount: sql<number>`count(${reservations.id})::int`,
    })
    .from(corporateClients)
    .innerJoin(reservations, eq(reservations.corporateClientId, corporateClients.id))
    .where(and(eq(reservations.restaurantId, restaurantId), isNotNull(reservations.corporateClientId)))
    .groupBy(corporateClients.id)
    .orderBy(corporateClients.name);
  return rows;
}
```

- [ ] **Step 4: Run, expect pass**

Run: `set -a && source .env.local.bak && set +a && npx jest -t "listCorporateClientsForRestaurant returns"`
Expected: PASS.

- [ ] **Step 5: Add the `companies` i18n (contract + ro/en/de) — needed before the page type-checks**

The roll-up page reads the strongly-typed `getMessages(..., "partner.corporate")` object, so `PartnerCorporateMessages.companies` must exist first.

In `src/lib/i18n/messages.ts`, add to the `PartnerCorporateMessages` interface:

```ts
  companies: {
    pageTitle: string;
    subtitle: string;
    empty: string;
    colName: string;
    colCui: string;
    colStatus: string;
    colReservations: string;
    status: { pending_verification: string; active: string; suspended: string };
  };
```

Add the `companies` object to each locale's `partner.corporate.json`:

`ro`:
```json
"companies": {
  "pageTitle": "Companii",
  "subtitle": "Companii asociate rezervărilor acestui local.",
  "empty": "Încă nu există rezervări asociate unei companii.",
  "colName": "Companie",
  "colCui": "CUI",
  "colStatus": "Stare",
  "colReservations": "Rezervări",
  "status": { "pending_verification": "Neverificată", "active": "Activă", "suspended": "Suspendată" }
}
```
`en`:
```json
"companies": {
  "pageTitle": "Companies",
  "subtitle": "Companies tagged on this venue's reservations.",
  "empty": "No reservations are tagged to a company yet.",
  "colName": "Company",
  "colCui": "CUI",
  "colStatus": "Status",
  "colReservations": "Reservations",
  "status": { "pending_verification": "Unverified", "active": "Active", "suspended": "Suspended" }
}
```
`de`:
```json
"companies": {
  "pageTitle": "Unternehmen",
  "subtitle": "Unternehmen, die mit den Reservierungen dieses Lokals verknüpft sind.",
  "empty": "Noch keine Reservierungen sind einem Unternehmen zugeordnet.",
  "colName": "Unternehmen",
  "colCui": "CUI",
  "colStatus": "Status",
  "colReservations": "Reservierungen",
  "status": { "pending_verification": "Nicht verifiziert", "active": "Aktiv", "suspended": "Gesperrt" }
}
```

Run: `npx jest src/lib/i18n/__tests__/messages.test.ts`
Expected: PASS (parity + no-Romanian guard).

- [ ] **Step 6: Create the roll-up page**

Create `src/app/(app)/partner/(dashboard)/corporate/companies/page.tsx`:

```tsx
import { getPartnerRestaurant } from "@/lib/auth/partner";
import { listCorporateClientsForRestaurant } from "@/lib/repos/corporate-clients-repo";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function CorporateCompaniesPage() {
  const restaurant = await getPartnerRestaurant();
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const companies = await listCorporateClientsForRestaurant(restaurant.id);

  return (
    <main className="max-w-4xl px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold leading-tight text-text-primary">
          {m.companies.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{m.companies.subtitle}</p>
      </header>

      {companies.length === 0 ? (
        <div className="rounded-card border border-border bg-surface-white p-10 text-center">
          <p className="font-semibold text-text-primary">{m.companies.empty}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-bg text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-text-secondary">{m.companies.colName}</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">{m.companies.colCui}</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">{m.companies.colStatus}</th>
                <th className="px-4 py-3 font-semibold text-text-secondary text-right">{m.companies.colReservations}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {companies.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-semibold text-text-primary">{c.name}</td>
                  <td className="px-4 py-3 text-text-secondary tabular-nums">{c.cui}</td>
                  <td className="px-4 py-3 text-text-secondary">{m.companies.status[c.status]}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-primary">{c.reservationCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (`m.companies.*` now resolves against the contract added in Step 5).

- [ ] **Step 8: Commit**

```bash
git add src/lib/repos/corporate-clients-repo.ts src/lib/repos/__tests__/corporate-clients-repo.test.ts src/lib/i18n/messages.ts src/messages "src/app/(app)/partner/(dashboard)/corporate/companies/page.tsx"
git commit -m "feat(corporate): per-company roll-up repo query + partner page + companies i18n"
```

---

## Task 10: Flip the overview card + footer + count

**Files:**
- Modify: `src/components/partner/CorporateOverview.tsx`
- Modify: `src/app/(app)/partner/(dashboard)/corporate/page.tsx`

- [ ] **Step 1: Flip the card + add the footer block**

In `CorporateOverview.tsx`, change the CARDS entry:

```ts
  { key: "corporateMeals", phase1: true },
```

Add a footer block after the `meetingNooks` block (before the closing `</div>` of the card map, after line 125):

```tsx
            {c.key === "corporateMeals" && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-xs font-semibold text-text-muted">
                  {state.enabled ? t("overview.enabledHint") : t("overview.disabledHint")}
                  {state.openCount !== undefined && state.openCount > 0 && (
                    <>
                      {" · "}
                      <span className="text-brand-primary">
                        {t("overview.corporateClientsCount", { count: state.openCount })}
                      </span>
                    </>
                  )}
                </span>
                <Link
                  href="/partner/corporate/companies"
                  className="inline-flex flex-none items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
                >
                  {t("overview.manageCompanies")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
```

(`state.openCount` is reused as the generic count slot — see Step 2. `CapState` already permits `openCount?`.)

- [ ] **Step 2: Pass the count from the page**

In `corporate/page.tsx`, add the count query (after `pendingMeetingRows`):

```ts
  const corporateClientRows = await listCorporateClientsForRestaurant(restaurant.id);
```

Import it at top: `import { listCorporateClientsForRestaurant } from "@/lib/repos/corporate-clients-repo";`

Change the `corporateMeals` capability prop:

```ts
          corporateMeals: {
            enabled: restaurant.acceptsCorporateMeals,
            openCount: corporateClientRows.length,
          },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/partner/CorporateOverview.tsx "src/app/(app)/partner/(dashboard)/corporate/page.tsx"
git commit -m "feat(corporate): enable corporateMeals card with companies footer + count"
```

---

## Task 11: i18n (ro/en/de) + contracts

**Files:**
- Modify: `src/lib/i18n/messages.ts` (`BookingMessages`, `PartnerReservationsMessages`, `PartnerCorporateMessages`)
- Modify: `src/messages/{ro,en,de}/booking.json`, `partner.reservations.json`, `partner.corporate.json`

- [ ] **Step 1: Extend the contracts in `messages.ts`**

Under `BookingMessages` → `sheet.stepIdentity`, add:

```ts
        companyToggleLabel: string;
        companyCui: {
          fieldLabel: string;
          placeholder: string;
          searchingAriaLabel: string;
          foundAriaLabel: string;
          resolvedPrefix: string;
        };
```

Under `PartnerReservationsMessages`, add a `badge` and `filters` group:

```ts
  badge: { corporate: string };
  filters: { corporateOnly: string };
```

Under `PartnerCorporateMessages` → `overview`, add:

```ts
    manageCompanies: string;
    corporateClientsCount: string;
```

(The `PartnerCorporateMessages.companies` group was already added in Task 9 Step 5.)

- [ ] **Step 2: Add the RO strings**

`src/messages/ro/booking.json` → `sheet.stepIdentity`:

```json
"companyToggleLabel": "Rezervare pentru o companie",
"companyCui": {
  "fieldLabel": "CUI",
  "placeholder": "RO12345678",
  "searchingAriaLabel": "se caută",
  "foundAriaLabel": "găsit",
  "resolvedPrefix": "Denumire: "
}
```

`src/messages/ro/partner.reservations.json`:

```json
"badge": { "corporate": "Companie" },
"filters": { "corporateOnly": "Doar companii" }
```

`src/messages/ro/partner.corporate.json` → `overview`: add `"manageCompanies": "Companii", "corporateClientsCount": "{count} companii"`. (The `companies` object was added in Task 9 Step 5.)

- [ ] **Step 3: Add the EN strings**

`en/booking.json` → `sheet.stepIdentity`:

```json
"companyToggleLabel": "Booking for a company",
"companyCui": {
  "fieldLabel": "Company ID (CUI)",
  "placeholder": "RO12345678",
  "searchingAriaLabel": "searching",
  "foundAriaLabel": "found",
  "resolvedPrefix": "Name: "
}
```

`en/partner.reservations.json`: `"badge": { "corporate": "Company" }, "filters": { "corporateOnly": "Company only" }`

`en/partner.corporate.json` → `overview`: `"manageCompanies": "Companies", "corporateClientsCount": "{count} companies"`. (The `companies` object was added in Task 9 Step 5.)

- [ ] **Step 4: Add the DE strings**

`de/booking.json` → `sheet.stepIdentity`:

```json
"companyToggleLabel": "Buchung für ein Unternehmen",
"companyCui": {
  "fieldLabel": "Unternehmens-ID (CUI)",
  "placeholder": "RO12345678",
  "searchingAriaLabel": "wird gesucht",
  "foundAriaLabel": "gefunden",
  "resolvedPrefix": "Name: "
}
```

`de/partner.reservations.json`: `"badge": { "corporate": "Unternehmen" }, "filters": { "corporateOnly": "Nur Unternehmen" }`

`de/partner.corporate.json` → `overview`: `"manageCompanies": "Unternehmen", "corporateClientsCount": "{count} Unternehmen"`. (The `companies` object was added in Task 9 Step 5.)

- [ ] **Step 5: Run the i18n parity guard**

Run: `npx jest src/lib/i18n/__tests__/messages.test.ts`
Expected: PASS (3-locale parity + no-Romanian-in-en/de guard green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/messages.ts src/messages
git commit -m "feat(corporate): i18n ro/en/de for company toggle, badge/filter, companies roll-up"
```

---

## Task 12: Full gate run + live verification

- [ ] **Step 1: Static gates**

Run: `npx tsc --noEmit`
Run: `npx eslint $(git diff --name-only main... | rg '\.tsx?$' | tr '\n' ' ')`
Expected: clean.

- [ ] **Step 2: Scoped test sweep (by name, not full suite)**

Run each: the anaf, corporate-upsert, reservations actions, corporate-clients-repo (with `.env.local.bak` sourced for the DB ones), reservation-sheet-v2, messages parity. All PASS.

- [ ] **Step 3: Live verify (dev server :3000, prod DB)**

Use the QA partner (Atelier Floreasca `18ed759e-209d-4d3f-943a-df7ff9382e52`). Steps:
1. Enable the corporate-meals capability for the venue (toggle on `/partner/corporate`, or set `accepts_corporate_meals=true` via psql; record the prior value).
2. On the public venue page, open the booking sheet, advance to identity, tick "Booking for a company", enter a real CUI (e.g. a known RO company), confirm the ANAF panel resolves, complete the booking with guest name `ZZ_VERIFY …` and a far-future date.
3. Assert via psql: the reservation row has `corporate_client_id` set and a `corporate_clients` row exists (canonical digits-only `cui`, `pending_verification`).
4. On `/partner/(dashboard)/reservations`, confirm the badge shows and "Corporate only" filters to it. On `/partner/corporate/companies`, confirm the company appears with count 1.
5. **Self-clean:** delete the test reservation and the created `corporate_clients` row via psql; restore `accepts_corporate_meals` to its recorded prior value.

- [ ] **Step 4: Final commit (if any verify-driven fixes)**

```bash
git add -A && git commit -m "chore(corporate): phase 3 verification fixes"
```

---

## Notes for the executor

- **No migration.** Do not author SQL. All columns exist.
- **Prod-DB hazard** is real — never run the full jest suite; the DB-backed tests (`corporate-clients-repo`) must be run by `-t` name with `.env.local.bak` sourced.
- The server action returns **literal English** error strings (matching the existing file convention) — the invalid-CUI error follows suit; no i18n key needed for it.
- `state.openCount` on the overview card is reused as a generic count slot for the companies footer; no `CapState` change needed.
- Push to `main` only on the user's explicit say-so.
