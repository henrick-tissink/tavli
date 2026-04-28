# Bugfix batch — 2026-04-28

Eleven independent bug fixes raised by Alin Sari (WhatsApp screenshots, 2026-04-27). Each is implemented as a self-contained TDD unit. Order is ascending complexity.

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Multi-select cuisines storage | A — migrate to `text[]`, drop old column |
| 2 | Admin "View →" target | A — new `/admin/restaurants/[id]` page |
| 3 | Map fix scope | C — hide when null + geocode on save + backfill script |
| 4 | Hero copy | A — drop `, {city}` everywhere; keep time-aware variants |
| 5 | Password show/hide | A — apply to all password fields (3 forms) |

## Bug fixes

### Bug 1 — Onboarding landing copy
**File:** `src/app/onboard/[token]/page.tsx`
Replace "in about 10 minutes" → "in a few minutes".
**Test:** new `__tests__/page.test.tsx`; render valid branch with mocked `validateToken`, assert phrase.

### Bug 2 — Password show/hide button
**Files:** new `src/components/password-input.tsx`; update `AccountForm`, admin `SignInForm`, partner `PartnerSignInForm`.
Shared component wraps `<input>` with an absolute-positioned eye toggle (lucide `Eye`/`EyeOff`), `aria-pressed`, no focus loss on toggle.
**Test:** `__tests__/password-input.test.tsx` — initial type=password, toggle flips, aria-pressed reflects state, focus preserved.

### Bug 3 — Cuisines multi-select
**Migration:** `drizzle/migrations/0005_cuisines_array.sql`
```sql
ALTER TABLE restaurants ADD COLUMN cuisines text[] NOT NULL DEFAULT '{}';
UPDATE restaurants SET cuisines = ARRAY[cuisine] WHERE cuisine IS NOT NULL AND cuisine <> '';
ALTER TABLE restaurants DROP COLUMN cuisine;
```
**Schema:** `src/lib/db/schema.ts` — replace `cuisine: varchar(64)` with `cuisines: text("cuisines").array().notNull().default([]).$type<string[]>()`.
**Types:** `Restaurant.cuisines: string[]`. Helper `formatCuisines(arr)` joins with " · ".
**UI:** `ProfileForm` multi-checkbox using `Pill`, hidden inputs as `cuisines[]`. Server action collects via `formData.getAll`. Validation: ≥1.
**Filter logic:** `filters.cuisines.some(f => r.cuisines.some(c => c.toLowerCase() === f.toLowerCase()))`.
**Repo:** select `cuisines`, map straight through. Card/detail/map/search/admin show via `formatCuisines`.
**Tests:** new multi-select test, update filter-context test, update restaurant-card test, update server-action validation.

### Bug 4 — Price input
**File:** `src/components/partner/ItemDialog.tsx`
Store `priceLeiInput: string`, `inputMode="decimal"`, parse on save (`Number(s.replace(",", "."))`). Empty → 0.
**Test:** typing "1"+"5" → "15", clearing → 0, "1.5" + "1,5" both → 1.5.

### Bug 5 — UUID guard on saveItem
**Files:** `src/app/partner/(dashboard)/menu/actions.ts`, `MenuEditor.tsx`, `ItemDialog.tsx`
Server: zod-validate `sectionId` UUID; return friendly error. Never round-trip empty UUIDs to PG.
**Test:** `__tests__/actions.test.ts` — `saveItem({sectionId: ""})` returns friendly error, no Supabase call.

### Bug 6 — Admin restaurant "View →"
**New file:** `src/app/admin/(gated)/restaurants/[id]/page.tsx`
Read-only summary; link to public `/[city]/[slug]` if live.
**Test:** renders restaurant heading; renders "Not found" for missing.

### Bug 7 — Reservation sheet preselect + More
**File:** `src/components/reservation-sheet.tsx`, `DetailPageClient.tsx`
- Add `useEffect` syncing `selectedSlot` to `preSelectedSlot` when `open` flips true.
- Reset `step`, `submitError` on reopen.
- DetailPageClient passes `onMore={() => openSheet()}` to TimeSlotPills.
**Test:** sheet test — preselect persists across reopen with new slot; reopen returns to selecting step.

### Bug 8 — Map ocean + Website button
**Files:** `src/components/google-map-embed.tsx`, `src/lib/repos/restaurants-repo.ts`, `src/lib/types.ts`, `DetailPageClient.tsx`, new `src/lib/geocoding.ts`, profile actions, new `scripts/backfill-geocoding.ts`.
- `RestaurantDetail.lat/lng: number | null`. Repo no longer coerces to 0.
- `GoogleMapEmbed` returns null when lat or lng is null.
- DetailPageClient: hide map + Get Directions if null; remove Website button (mobile + desktop).
- `geocode(address)` with `GOOGLE_GEOCODING_KEY` (fallback to embed key); always returns `{lat,lng}|null`, never throws.
- profile save actions geocode after update; non-fatal failure.
- Backfill script processes `lat IS NULL` rows; idempotent; not auto-run.
**Tests:** geocoding mock-fetch happy/error paths; embed null branches; detail page hides controls when null + omits Website button.

### Bug 9 — MapFab overlap
**File:** `src/app/[city]/CityShell.tsx`
Suppress MapFab on detail/menu routes (pathname matches `/[city]/[slug]` or `/[city]/[slug]/menu`).
**Test:** rendering at `/bucuresti/casa-veche` → no `aria-label="Open map"`; at `/bucuresti` → present.

### Bug 10 — "Still hungry, București?" → "Still hungry?"
**File:** `src/lib/time-context.tsx`
Drop `, {city}` / `{city}` from every greeting in `GREETING_MAP` and the default. `FeedPageClient`'s `.replace("{city}", ...)` becomes a no-op (left for cleanliness).
**Test:** `time-context.test.ts` — late-night greeting === "Still hungry?"; no greeting contains "București"/"{city}".

### Bug 11 — Filter sheet unreachable bottom
**File:** `src/components/bottom-sheet.tsx`, `src/components/filter-sheet.tsx`
- Bump BottomSheet `z-50` → `z-[60]` (above TabBar, MapFab).
- Panel adds `pb-[calc(env(safe-area-inset-bottom)+16px)]` to clear iOS home indicator.
**Test:** filter-sheet test — sticky button reachable via `getByRole`; class includes `z-[60]`.

## Cross-cutting

- **TDD:** for each bug, failing test → fix → green.
- **Verification:** `npm test` + `npm run lint` clean before claiming complete.
- **Commits:** ask user before any non-spec commits. Migration is **NOT auto-run**.
- **Out of scope:** drafts/staging visibility for admin detail (Bug 6 stays read-only basic), partner impersonation, geocoding rate-limit handling beyond fail-soft.

## Risks

- Cuisine migration ripples through ~10 files. Grep + tsc must pass before declaring done.
- Geocoding API key may not be enabled — fail-soft means listing still saves; map just won't render.
- iOS-specific behaviour for price input is hard to verify without a device. The test asserts the React-level invariants (string state, `inputMode=decimal`).
