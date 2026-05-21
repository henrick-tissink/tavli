# §3.6 sub-unit C — drop `restaurants.owner_user_id` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop `restaurants.owner_user_id` column + everything that referenced it. Closes the §3.6 trilogy.

**Architecture:** One hand-crafted migration (`0015_drop_owner_user_id.sql`) wrapped in `BEGIN;…COMMIT;` with five phases (pre-flight → `is_owner_of` rewrite → `claim_invitation` rewrite → inline policy rewrites → column drop). Drizzle mirror update. `legacyResolver` deletion. 3 test fixture updates. Single commit (Drizzle change + migration + code + fixtures are mutually dependent).

**Tech Stack:** Postgres SQL (plpgsql + DO blocks), Drizzle ORM.

**Spec reference:** `docs/superpowers/specs/2026-05-21-drop-owner-user-id-sub-unit-C-design.md` (committed at `d1b416a`).

**Commit shape:** Single commit.

---

## File Structure

**Created:**
- `drizzle/migrations/0015_drop_owner_user_id.sql` (hand-authored)
- `drizzle/migrations/meta/0015_snapshot.json` (drizzle-kit generated)

**Modified:**
- `drizzle/migrations/meta/_journal.json` — appended idx-15 entry
- `src/lib/db/schema.ts` — remove `ownerUserId` field + `restaurants_owner_idx` from `restaurants` table

**Deleted:**
- `src/lib/authz/resolvers/legacy.ts`

**Test fixture updates:**
- `src/lib/repos/__tests__/event-requests-rls.test.ts` — remove `ownerUserId` from restaurant insert
- `src/app/api/event-requests/__tests__/actions.test.ts` — remove `ownerUserId` from `seedR` helper + derived references
- `src/app/partner/(dashboard)/corporate/spaces/__tests__/actions.test.ts` — remove `ownerUserId` from fixture

**Untouched (intentional):**
- `draft_restaurants.owner_user_id` column and all callsites (different table, different concept)
- `src/lib/authz/can.ts`, `src/lib/authz/resolvers/org.ts`, `src/lib/authz/permissions.ts`
- All other source files (sub-unit B already moved them off)

---

## Task 1: Update Drizzle schema

**Files:**
- Modify: `src/lib/db/schema.ts` — `restaurants` table

- [ ] **Step 1: Remove the `ownerUserId` field**

Find this line in the `restaurants` table definition (around line 196):
```ts
  ownerUserId: uuid("owner_user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
```
Delete it.

- [ ] **Step 2: Remove the `restaurants_owner_idx` from the index list**

Find this line in the restaurants `(t) => [...]` array (around line 215):
```ts
  index("restaurants_owner_idx").on(t.ownerUserId),
```
Delete it.

- [ ] **Step 3: Type-check (will fail)**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: errors in `src/lib/authz/resolvers/legacy.ts` (the file references `restaurants.ownerUserId`, which is now gone). Expected — Task 4 deletes that file.

---

## Task 2: Delete legacyResolver

**Files:**
- Delete: `src/lib/authz/resolvers/legacy.ts`

- [ ] **Step 1: Delete the file**

Run: `rm src/lib/authz/resolvers/legacy.ts`

- [ ] **Step 2: Type-check (should now pass)**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: zero errors. If errors persist mentioning `legacy` or `ownerUserId`, find the lingering reference.

---

## Task 3: Update test fixtures

**Files:**
- Modify: `src/lib/repos/__tests__/event-requests-rls.test.ts`
- Modify: `src/app/api/event-requests/__tests__/actions.test.ts`
- Modify: `src/app/partner/(dashboard)/corporate/spaces/__tests__/actions.test.ts`

- [ ] **Step 1: `src/lib/repos/__tests__/event-requests-rls.test.ts`**

Find line ~88 with `ownerUserId: ownerId,` inside the restaurants insert `.values(...)` block. Delete that line.

- [ ] **Step 2: `src/app/api/event-requests/__tests__/actions.test.ts`**

Find the `seedR` helper (around line 77) — it constructs a restaurant fixture and accepts an `ownerUserId` parameter. Find each occurrence:
- Line ~77: `const r = await seedR({ ownerUserId: owner.id });` — the call site
- Line ~93: `return { restaurant: r, ownerUserId: owner.id };` — the return object
- Lines ~157, 159, 162: derived references that destructure or use `ownerUserId`

Plan:
1. In the `seedR` helper definition itself, remove the `ownerUserId` parameter and the corresponding `ownerUserId: ...` field in the restaurants insert. The owner is already created via the existing `organizations` + `organization_members(owner)` + `restaurant_staff(owner)` fixture pattern (added in commit `38ab7a4`).
2. In `seedVenueWithOwner` or whatever wraps `seedR`, remove the `{ ownerUserId: owner.id }` argument.
3. In the return object at line ~93, remove `ownerUserId: owner.id` — callers receive `owner.id` directly via the existing `owner` variable in their scope.
4. At lines ~157, 159, 162: if these destructure `{ ownerUserId }`, replace with `{ ownerId }` or compute from the seeded owner.

Read the file's actual surrounding context before making the changes. Goal: zero references to `ownerUserId` in this file.

- [ ] **Step 3: `src/app/partner/(dashboard)/corporate/spaces/__tests__/actions.test.ts`**

Find line ~41 with `ownerUserId: data!.user!.id,` inside the restaurants insert. Delete that line.

- [ ] **Step 4: Type-check + run the touched tests**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: clean.

Run: `npx jest src/lib/repos/__tests__/event-requests-rls.test.ts src/app/api/event-requests src/app/partner/\(dashboard\)/corporate/spaces 2>&1 | tail -10`
Expected: tests either pass OR fail with the pre-existing local-DB-not-running errors only (no NEW failures introduced).

---

## Task 4: Generate migration scaffold via drizzle-kit

- [ ] **Step 1: Run drizzle-kit generate**

Run: `npx drizzle-kit generate --name=drop_owner_user_id`
Expected: a new file `drizzle/migrations/0015_drop_owner_user_id.sql` with drizzle-kit's auto-generated DROP COLUMN statement, plus `0015_snapshot.json` + journal entry. The auto-SQL will be discarded in Task 5; we keep the snapshot + journal.

- [ ] **Step 2: Verify file naming + journal**

```bash
ls drizzle/migrations/0015_drop_owner_user_id.sql
cat drizzle/migrations/meta/_journal.json | tail -10
```
Journal's last entry should have `tag: "0015_drop_owner_user_id"`. If different, rename the file + update the journal entry by hand.

---

## Task 5: Replace migration body with the phased SQL

**Files:**
- Modify: `drizzle/migrations/0015_drop_owner_user_id.sql` — full rewrite

- [ ] **Step 1: Overwrite the file with the phased migration**

```sql
-- 0015_drop_owner_user_id.sql
-- §3.6 sub-unit C. Closes the column-ownership swap by dropping
-- restaurants.owner_user_id + retiring everything that referenced it.
--
-- Phases:
--   1. Pre-flight: every restaurant has a restaurant_staff(owner) row.
--   2. Rewrite is_owner_of() to check restaurant_staff ∪ organization_members.
--   3. Rewrite claim_invitation() to seed orgs+staff instead of owner_user_id.
--   4. Rewrite inline owner_user_id policies via is_owner_of().
--   5. DROP COLUMN restaurants.owner_user_id (cascades index + FK).

BEGIN;

-- ─── Phase 1: pre-flight ────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE NOT EXISTS (
      SELECT 1 FROM "restaurant_staff" rs
      WHERE rs."restaurant_id" = r."id"
        AND rs."role" = 'owner'
        AND rs."is_active" = true
    )
  ) THEN
    RAISE EXCEPTION 'Restaurant without restaurant_staff(owner) row — backfill from sub-unit A is incomplete; refusing to drop owner_user_id';
  END IF;
END $$;

-- ─── Phase 2: rewrite is_owner_of ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_owner_of(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.restaurant_staff rs
      WHERE rs.restaurant_id = p_restaurant_id
        AND rs.user_id = auth.uid()
        AND rs.role = 'owner'
        AND rs.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.restaurants r ON r.organization_id = om.organization_id
      WHERE r.id = p_restaurant_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.is_active = true
    );
$$;

-- ─── Phase 3: rewrite claim_invitation ──────────────────────────────────
-- The function's signature is preserved (single caller in
-- src/app/onboard/[token]/account/actions.ts:66). Behavior change: no
-- longer writes owner_user_id; instead seeds organizations +
-- organization_members(owner) + restaurant_staff(owner) +
-- profiles.default_organization_id.
CREATE OR REPLACE FUNCTION public.claim_invitation(
  p_raw_token text,
  p_user_id uuid,
  p_full_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_hash text;
  v_invitation public.invitations%rowtype;
  v_restaurant_id uuid;
  v_org_id uuid;
  v_partner_email text;
  v_partner_locale varchar(2);
  v_partner_name text;
BEGIN
  v_token_hash := encode(extensions.digest(p_raw_token, 'sha256'::text), 'hex');

  SELECT * INTO v_invitation
  FROM public.invitations
  WHERE token_hash = v_token_hash
  FOR UPDATE;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation token' USING ERRCODE = 'TV101';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is %', v_invitation.status USING ERRCODE = 'TV102';
  END IF;
  IF v_invitation.expires_at < now() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_invitation.id;
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = 'TV103';
  END IF;

  UPDATE public.profiles
     SET role = 'restaurant_owner',
         full_name = coalesce(p_full_name, full_name)
   WHERE id = p_user_id;

  -- Read the partner's email + locale from their profile (the org needs them).
  SELECT email, SUBSTRING(locale FOR 2), full_name
    INTO v_partner_email, v_partner_locale, v_partner_name
    FROM public.profiles
   WHERE id = p_user_id;

  -- Seed the org now (or fetch if the partner already has a default_organization_id).
  -- A claim_invitation call always seeds a fresh org — the invitation carries
  -- a new restaurant identity, so the partner's existing default is preserved
  -- (default_organization_id is updated to the new org only when not set).
  INSERT INTO public.organizations (name, primary_contact_email, locale, status)
  VALUES (
    coalesce(v_invitation.proposed_name, v_partner_name, 'New Restaurant'),
    v_partner_email,
    coalesce(v_partner_locale, 'ro'),
    'active'
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  VALUES (v_org_id, p_user_id, 'owner', true);

  IF v_invitation.restaurant_id IS NULL THEN
    INSERT INTO public.restaurants (
      slug, name, cuisines, city_id, organization_id, status, email
    ) VALUES (
      'pending-' || substr(p_user_id::text, 1, 8),
      coalesce(v_invitation.proposed_name, 'New Restaurant'),
      ARRAY[]::text[],
      v_invitation.city_id,
      v_org_id,
      'draft',
      v_invitation.email
    )
    RETURNING id INTO v_restaurant_id;
  ELSE
    UPDATE public.restaurants
       SET organization_id = v_org_id
     WHERE id = v_invitation.restaurant_id;
    v_restaurant_id := v_invitation.restaurant_id;
  END IF;

  INSERT INTO public.restaurant_staff (restaurant_id, user_id, role, is_active)
  VALUES (v_restaurant_id, p_user_id, 'owner', true);

  -- Set the partner's default-org pointer if not already set.
  UPDATE public.profiles
     SET default_organization_id = v_org_id
   WHERE id = p_user_id
     AND default_organization_id IS NULL;

  UPDATE public.invitations
     SET status = 'claimed',
         claimed_at = now(),
         claimed_by_user_id = p_user_id,
         restaurant_id = v_restaurant_id
   WHERE id = v_invitation.id;

  INSERT INTO public.draft_restaurants (owner_user_id, invitation_id, current_step)
  VALUES (p_user_id, v_invitation.id, 'profile')
  ON CONFLICT (owner_user_id) DO UPDATE
     SET invitation_id = excluded.invitation_id,
         updated_at = now();

  RETURN v_restaurant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_invitation(text, uuid, text) TO authenticated;

-- ─── Phase 4: rewrite inline owner_user_id policies ─────────────────────

-- 4a. restaurants table itself — two policies use inline owner_user_id.
DROP POLICY IF EXISTS "restaurants_owner_read" ON public.restaurants;
CREATE POLICY "restaurants_owner_read" ON public.restaurants FOR SELECT
  USING (public.is_owner_of(id));

DROP POLICY IF EXISTS "restaurants_owner_update" ON public.restaurants;
CREATE POLICY "restaurants_owner_update" ON public.restaurants FOR UPDATE
  USING (public.is_owner_of(id))
  WITH CHECK (public.is_owner_of(id));

-- 4b. storage bucket policies (0002_storage_bucket.sql).
-- These check that the upload path corresponds to a restaurant the user
-- owns. The original predicate was `r.owner_user_id = auth.uid()`; the new
-- one is `public.is_owner_of(r.id)`.
DROP POLICY IF EXISTS "restaurant_photos_owner_upload" ON storage.objects;
CREATE POLICY "restaurant_photos_owner_upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-photos'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id::text = split_part(name, '/', 1)
        AND public.is_owner_of(r.id)
    )
  );

DROP POLICY IF EXISTS "restaurant_photos_owner_delete" ON storage.objects;
CREATE POLICY "restaurant_photos_owner_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'restaurant-photos'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id::text = split_part(name, '/', 1)
        AND public.is_owner_of(r.id)
    )
  );

-- 4c. corporate_foundations (0008_corporate_foundations.sql) — 8 inline references
-- spread across several policies. Rewrite by replacing
-- `r."owner_user_id" = auth.uid()` with `public.is_owner_of(r."id")` in each.
-- (Implementer: read 0008's policy bodies and apply this textual substitution
-- via DROP+CREATE per policy. The function call works identically inside the
-- EXISTS subquery.)

-- 4d. private_spaces + quote_line_items (0010_private_spaces_and_quote_lines.sql).
-- Same pattern: replace `r."owner_user_id" = auth.uid()` with
-- `public.is_owner_of(r."id")` in 4 policy bodies.

-- 4e. audit_logs (0011_audit_logs.sql).
DROP POLICY IF EXISTS "audit_logs_restaurant_owner_read" ON public.audit_logs;
CREATE POLICY "audit_logs_restaurant_owner_read" ON public.audit_logs FOR SELECT
  USING (
    "restaurant_id" IS NOT NULL
    AND public.is_owner_of("restaurant_id")
  );

-- ─── Phase 5: drop the column ───────────────────────────────────────────
-- Index restaurants_owner_idx + FK restaurants_owner_user_id_profiles_id_fk
-- cascade automatically.
ALTER TABLE public.restaurants DROP COLUMN owner_user_id;

COMMIT;
```

**Note for the implementer:** Phases 4c and 4d are described abstractly because the policy-body SQL is long. You need to:
1. Read `drizzle/migrations/0008_corporate_foundations.sql` and find each policy that has `r."owner_user_id" = auth.uid()` in its USING/WITH CHECK. There are 8 inline references.
2. For each affected policy, emit DROP POLICY + CREATE POLICY with the same name/table/operation, but with `public.is_owner_of(r."id")` in place of the owner_user_id check.
3. Repeat for `drizzle/migrations/0010_private_spaces_and_quote_lines.sql` (4 inline references → 2-3 policies likely).

Add these DROP/CREATE blocks to Phase 4 of the migration in the right slot (between 4b and 4e). Keep the migration's overall BEGIN/COMMIT atomic.

- [ ] **Step 2: Verify snapshot picks up the column removal**

Run: `grep -E "owner_user_id|restaurants_owner_idx" drizzle/migrations/meta/0015_snapshot.json | head`
Expected: zero hits OR only references inside the snapshot's `prevId` reference (which captures the pre-migration state — that's fine). If `restaurants.owner_user_id` appears as a column in the snapshot's restaurants entry, drizzle-kit generated the snapshot wrong; re-run from Task 1.

- [ ] **Step 3: Type-check (final)**

Run: `npx tsc --noEmit`
Expected: zero output (clean).

---

## Task 6: Inspect 0008 and 0010 inline policies (deep-dive sub-task)

**Files:**
- Read: `drizzle/migrations/0008_corporate_foundations.sql`
- Read: `drizzle/migrations/0010_private_spaces_and_quote_lines.sql`

- [ ] **Step 1: Identify 0008's inline owner_user_id policies**

Run: `grep -n "owner_user_id" drizzle/migrations/0008_corporate_foundations.sql`
Expected: ~8 lines.

For each hit, look at the surrounding CREATE POLICY block to identify the policy name + table. Note them.

- [ ] **Step 2: For each policy, draft DROP+CREATE SQL with `public.is_owner_of(r."id")`**

For each identified policy in 0008, add to the migration's Phase 4 (between the marker comments for 4b and 4e) the DROP POLICY + CREATE POLICY pair. Use the SAME policy name, table, operation, and policy body — only the inline `r."owner_user_id" = auth.uid()` check changes to `public.is_owner_of(r."id")`.

- [ ] **Step 3: Same for 0010**

Run: `grep -n "owner_user_id" drizzle/migrations/0010_private_spaces_and_quote_lines.sql`
Expected: ~4 lines.

Apply the same DROP+CREATE pattern.

- [ ] **Step 4: Re-verify the migration file**

Run: `grep -c "owner_user_id" drizzle/migrations/0015_drop_owner_user_id.sql`
Expected: only matches inside header comments or function bodies (e.g., the `draft_restaurants.owner_user_id` line in claim_invitation, which is intentionally untouched).

Run: `grep -c "DROP POLICY" drizzle/migrations/0015_drop_owner_user_id.sql`
Expected: at least 9 (2 restaurants + 2 storage + ~6 corporate + ~3 private/quote + 1 audit_logs). If lower, you missed inline references in 0008 or 0010.

---

## Task 7: Full verification sweep

- [ ] **Step 1: tsc**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Touched-area tests**

Run: `npx jest src/lib/audit src/lib/errors src/lib/jobs src/lib/webhooks src/lib/sentry src/lib/stripe src/lib/twilio src/lib/authz src/lib/restaurants src/lib/__tests__/server-action.test.ts 2>&1 | tail -5`
Expected: all pass.

- [ ] **Step 3: Lint baseline**

Run: `npm run lint 2>&1 | tail -5`
Expected: 14 errors (baseline unchanged).

- [ ] **Step 4: Build**

Run: `npm run build 2>&1 | tail -15`
Expected: success.

- [ ] **Step 5: Final grep for ownerUserId outside legitimate sites**

Run: `grep -rn "ownerUserId" src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v __tests__ | grep -v draftRestaurants | grep -v "lib/db/schema"`
Expected: zero hits. (The `lib/db/schema` entry should be only for `draftRestaurants.ownerUserId`, which is the PK of the `draft_restaurants` table — out of scope.)

If any hit appears, investigate — that's a missed callsite.

---

## Task 8: Stage everything + single commit + memory update

- [ ] **Step 1: Stage**

```bash
git add drizzle/migrations/0015_drop_owner_user_id.sql \
        drizzle/migrations/meta/0015_snapshot.json \
        drizzle/migrations/meta/_journal.json \
        src/lib/db/schema.ts \
        src/lib/repos/__tests__/event-requests-rls.test.ts \
        src/app/api/event-requests/__tests__/actions.test.ts \
        src/app/partner/\(dashboard\)/corporate/spaces/__tests__/actions.test.ts
git rm src/lib/authz/resolvers/legacy.ts
```

- [ ] **Step 2: Verify the staged diff**

Run: `git diff --staged --stat`
Expected: ~7-8 files. The `legacy.ts` line should show `(deleted)` or similar; the test fixtures should show small line counts; the schema + migration files should show the bulk of the diff.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(identity): drop restaurants.owner_user_id + rewrite is_owner_of/claim_invitation + delete legacyResolver per §3.6 sub-unit C

Migration 0015 closes the §3.6 column-ownership swap. Phases:
  1. Pre-flight: every restaurant has restaurant_staff(owner).
  2. is_owner_of() now checks restaurant_staff ∪ organization_members.
  3. claim_invitation() seeds organizations + organization_members +
     restaurant_staff + profiles.default_organization_id instead of
     writing owner_user_id.
  4. Inline owner_user_id policies in 0001/0002/0008/0010/0011 rewritten
     via the existing public.is_owner_of() abstraction.
  5. DROP COLUMN restaurants.owner_user_id (cascades index + FK).

legacyResolver retired — rollback is no longer possible after the
column drops, so the file is deleted rather than stubbed. Drizzle mirror
updated; 3 test fixtures cleaned of dead ownerUserId references.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Update memory**

Use the Edit tool against `~/.claude/projects/-Users-henricktissink-Sauce-masaro/memory/project_v1_build_phase.md`:
- Add a new row in the "Wave 2 — IN PROGRESS" / "Units shipped" table:

```
| §01 §3.6 sub-unit C — drop restaurants.owner_user_id | drizzle/migrations/0015_drop_owner_user_id.sql, src/lib/db/schema.ts, src/lib/authz/resolvers/legacy.ts (DELETED), 3 test fixtures | `<commit-SHA>` (single commit) | 0015 (not yet applied — user-triggered) |
```

- Remove "§01 §3.6 sub-unit C — drop restaurants.owner_user_id column + restaurants_owner_idx index (now unblocked)" from the Units remaining list.
- Update the Wave 2 progress note to reflect §3.6 trilogy closure.

- [ ] **Step 5: Update build-order doc**

Modify `docs/superpowers/architecture/build-order.md`:
- Update the §01 §3.6 entry on the relevant line to indicate sub-unit C is shipped.
- Append a 2026-05-21 Revisions entry: `§01 §3.6 sub-unit C shipped: restaurants.owner_user_id dropped + is_owner_of/claim_invitation rewritten + legacyResolver retired. §3.6 trilogy complete.`
- Bump the `*Last updated*` footer line.

Commit the build-order update as part of the SAME commit (re-stage before the commit in Step 3, or amend if you've already committed — actually do NOT amend; the simpler path is to include the build-order edit in the staging at Step 1).

Actually wait — the staging in Step 1 should include `docs/superpowers/architecture/build-order.md` if you do step 5 BEFORE step 1. Restructure as:
1. Do Steps 4 + 5 BEFORE the commit
2. Then stage everything (including build-order)
3. Then commit

The plan's order should be: (4) memory + (5) build-order → (1) stage → (2) verify → (3) commit. Re-run them in that order if you haven't already.

---

## Self-Review

**1. Spec coverage:**

- Spec §"Migration" Phase 1 → Task 5 Step 1 (Phase 1 SQL block)
- Spec §"Migration" Phase 2 (`is_owner_of` rewrite) → Task 5 Step 1
- Spec §"Migration" Phase 3 (`claim_invitation` rewrite) → Task 5 Step 1 (full body)
- Spec §"Migration" Phase 4 (inline policy rewrites) → Tasks 5 + 6 (Task 6 covers the 0008/0010 deep-dive)
- Spec §"Migration" Phase 5 (DROP COLUMN) → Task 5 Step 1
- Spec §"Drizzle schema mirror" → Task 1
- Spec §"Code cleanup" (delete legacy.ts) → Task 2
- Spec §"Test fixtures" → Task 3
- Spec §"Verification" → Task 7
- Spec §"Commit shape" → Task 8

All spec sections covered. ✓

**2. Placeholder scan:**

- Task 5 Step 1's Phase 4c/4d sections describe abstractly because the SQL is long; Task 6 fills them in with read+adapt instructions. This is an explicit deep-dive sub-task, not a "TODO."
- Task 8 Step 5's note about restructuring the order (4+5 before 1) is a real coordination issue, not a placeholder.

No `TBD`, `TODO`, or "similar to Task N" patterns. ✓

**3. Type consistency:**

- `public.is_owner_of(p_restaurant_id uuid)` signature unchanged — callers unchanged.
- `public.claim_invitation(p_raw_token text, p_user_id uuid, p_full_name text) RETURNS uuid` signature unchanged — caller in `src/app/onboard/[token]/account/actions.ts:66` unchanged.
- Drizzle identifiers (`organizationMembers`, `restaurantStaff`, `restaurants`) referenced consistently throughout.

No naming drift. ✓
