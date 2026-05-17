# Corporate Bookings — Phase 2a (Corporate Accounts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the consumer-side corporate-accounts foundation. A booker signs up their company at `/companies/new`, the system reconciles in-flight private-event requests they tagged with their CUI during Phase 1, the company lands on a `/companies/[slug]` dashboard, and admins can invite teammates with role granularity (owner / admin / booker / viewer). The CUI verification policy decides which signups go live immediately vs. queued for admin review.

**Architecture:** The schema landed in Phase 1 (commit `04b3a02` → migration `0008_corporate_foundations.sql`): `companies`, `company_members`, `company_invitations` are already in prod. The RLS `company_members_self_read` recursion bug was patched in `0009_fix_company_members_rls_recursion.sql` while building Phase 1 RLS tests. Phase 2a adds the application layer over these tables — repos, actions, dashboard UI, invitation accept flow, CUI claim reconciliation — and leaves the `company_invitations` RLS policy stub from 0008 to be filled in by Task 6 below.

**Tech Stack:** Same as Phase 1 — Next.js 16.2.4 App Router, Drizzle 0.45.2, Supabase Auth/RLS/Postgres, Resend, Jest 30. Adds nothing new; ANAF integration is reused (already done in Phase 1).

**Out of scope (later phases):**
- Phase 2b: `BookingTypeChips` corporate-meal affordance on the existing reservation flow.
- Phase 2c: eFactura invoicing + monthly platform-fee invoices.
- Phase 3: Standing reservations.
- Phase 4: Meeting nooks + Stripe.
- Custom contract terms / DocuSign integration.
- A full SCIM-grade SSO / directory sync for invitee provisioning.

---

## File Map

**New files:**

Repos:
- `src/lib/repos/company-members-repo.ts`
- `src/lib/repos/company-invitations-repo.ts`
- `src/lib/repos/__tests__/company-members-repo.test.ts`
- `src/lib/repos/__tests__/company-invitations-repo.test.ts`

Server actions:
- `src/app/companies/new/actions.ts`
- `src/app/companies/[slug]/(dashboard)/members/actions.ts`
- `src/app/companies/invitations/[token]/actions.ts`
- `src/app/companies/new/__tests__/actions.test.ts`
- `src/app/companies/[slug]/(dashboard)/members/__tests__/actions.test.ts`
- `src/app/companies/invitations/[token]/__tests__/actions.test.ts`

Consumer routes:
- `src/app/companies/new/page.tsx`
- `src/app/companies/[slug]/(dashboard)/layout.tsx`
- `src/app/companies/[slug]/(dashboard)/page.tsx` (overview)
- `src/app/companies/[slug]/(dashboard)/bookings/page.tsx`
- `src/app/companies/[slug]/(dashboard)/members/page.tsx`
- `src/app/companies/[slug]/(dashboard)/settings/page.tsx`
- `src/app/companies/invitations/[token]/page.tsx`

Admin routes:
- `src/app/admin/(gated)/companies/page.tsx` — list pending-verification queue.
- `src/app/admin/(gated)/companies/[id]/page.tsx` + `actions.ts` — verify/decline.

Email templates:
- `src/emails/CompanyInvitationEmail.tsx`
- `src/emails/CompanyVerifiedEmail.tsx`
- `src/emails/__tests__/Company.snapshots.test.tsx`

Migration:
- `drizzle/migrations/0010_company_invitations_rls.sql` — fills the stub RLS policies for `company_invitations` (invitee-by-token-hash read; admin-only write).

**Modified files:**

- `src/components/header.tsx` — add "Companies" dropdown when the signed-in user has ≥1 `company_members` row.
- `src/lib/auth/session.ts` — surface `memberOfCompanyIds: string[]` on the session object so the header can render without re-querying.
- `src/lib/email/event-requests.ts` — already exists; add `sendCompanyVerified` + `sendCompanyInvitation` to the shared dispatcher.

---

## Tasks

### Repos + RLS

- [ ] **Task 1 — `companies-repo.ts` extensions.** The Phase 1 stub (`c53ec6b feat(repos): companies claim-only operations`) already provides a `claimCompany` op. Add:
  - `getCompanyBySlug(slug)`
  - `getCompanyById(id)`
  - `listOpenEventRequestsByClaimedCui(cui)` — used by the reconciliation step.
  - `attachOpenEventRequestsToCompany(companyId, cui)` — transactional: select with `FOR UPDATE`, update `company_id` and clear `claimed_company_cui` on rows that match.
  - **Tests:** new entries in `companies-repo.test.ts`.

- [ ] **Task 2 — `company-members-repo.ts`.** CRUD against `company_members`:
  - `addMember(companyId, userId, role)` — INSERT, ON CONFLICT DO NOTHING.
  - `removeMember(companyId, userId)`.
  - `setRole(companyId, userId, role)` — owner / admin / booker / viewer.
  - `listMembers(companyId)` — joined with `profiles.email`.
  - `isAdminOrOwner(userId, companyId)` — boolean helper used by every member-mutating action.

- [ ] **Task 3 — `company-invitations-repo.ts`.** Hash-token based pattern.
  - `createInvitation({ companyId, email, role, invitedByUserId })` — generates `randomBytes(32)`, stores **sha256(token)** in `token_hash`, returns the plaintext token (only the original caller ever sees it).
  - `getInvitationByPlaintextToken(token)` — sha256s, looks up, returns row only if not expired and `accepted_at IS NULL`.
  - `markAccepted(invitationId, userId)` — atomic transition similar to event-requests' `transitionTo`.
  - `revokeInvitation(invitationId)`.

- [ ] **Task 4 — `0010_company_invitations_rls.sql`.** Backfill the stub policies promised by the design doc.
  - `company_invitations_admin_write`: company admins/owners can INSERT/UPDATE/DELETE invitations for their company (`USING + WITH CHECK`).
  - `company_invitations_invitee_read_by_hash`: anyone can SELECT a row by `token_hash = sha256(p_token)` via a SECURITY DEFINER function — RLS itself stays restrictive. (Same shape as `get_event_request_by_token`.)
  - Apply locally + record on prod via the deploy convention before any UI ships.

- [ ] **Task 5 — RLS tests.** Extend `event-requests-rls.test.ts` (or split into `company-rls.test.ts`) so the Phase 2a visibility matrix is locked in:
  - Company member can read their own company row.
  - Non-member can't.
  - Company admin can update company; booker can't.
  - Invitee can read invitation via SECURITY DEFINER token RPC; anon with bad token gets nothing; non-invitee authenticated user gets nothing.

### Signup wizard

- [ ] **Task 6 — `/companies/new/page.tsx`** multi-step form (mirrors `EventRequestSheet` ergonomics). Steps: legal details (CUI lookup → autofill from ANAF) → billing → members invite (optional) → review/submit.
  - Server action `createCompany(formData)`:
    1. `assertSession()` — must be authenticated.
    2. ANAF lookup via existing `src/lib/integrations/anaf.ts` to refresh / validate name/legal_name/address/vat_payer; reject if `vat_payer` returned and the user's claim contradicts.
    3. Run inside a transaction: INSERT `companies` (status=pending_verification), INSERT `company_members` (signing-up user as `owner`), call `attachOpenEventRequestsToCompany` to reconcile pre-signup claims.
    4. Run the **auto-verification rule**: if `ANAF` returned a registered domain that matches `user.email`'s domain → `UPDATE companies SET status='active', verified_at=NOW(), verified_by_user_id=NULL`. Else queue for manual review (admin notification).
    5. If verified now: send `CompanyVerifiedEmail`. Else: send a "we're reviewing" email.
    6. Redirect to `/companies/[slug]`.
  - **Tests:** action covers auto-verify path, manual-queue path, ANAF failure path, CUI already-claimed conflict path.

- [ ] **Task 7 — Reconciliation visibility.** After successful signup, dashboard overview surfaces: "We attached N in-flight event requests to your company" with a "Review" link. Source: `event_requests WHERE company_id = $companyId AND status NOT IN (terminal states)`. Mark a tiny non-load-bearing UI badge for the first 7 days.

### Dashboard

- [ ] **Task 8 — Dashboard layout + gating.** `/companies/[slug]/(dashboard)/layout.tsx` resolves the company by slug, fails if the user has no `company_members` row, exposes `role` in the layout context so children can hide/show admin-only buttons. Sidebar nav: Overview / Bookings / Members / Settings.

- [ ] **Task 9 — Overview page.** Shows MTD spend placeholder ("Coming with Phase 2c"), upcoming bookings (next 30 days), member count, recent activity (last 10 event_requests state changes for this company). Empty states polished.

- [ ] **Task 10 — Bookings page.** Filterable table of `event_requests + reservations + meeting_bookings WHERE company_id = $companyId`. Filters: status, date range, owner (which member booked). Search by occasion. Row click → drills into the existing tracking-token detail page (consumer view).

- [ ] **Task 11 — Members page.** List members (joined to `profiles.email`), role chip, "Invite" CTA opens a modal that creates a `company_invitations` row + sends `CompanyInvitationEmail`. Inline role change (admin/owner only). "Remove" with double-confirm.
  - Action `inviteMember(companyId, email, role)` — admin-only via `isAdminOrOwner`.
  - Action `setMemberRole(companyId, userId, role)` — admin-only; cannot demote the last owner.
  - Action `removeMember(companyId, userId)` — admin-only; cannot remove the last owner.

- [ ] **Task 12 — Settings page.** Edit legal details (re-runs ANAF on CUI change), billing address, eFactura toggle, monthly budget cap (informational only until Phase 2c). Owner-only.

### Invitation acceptance

- [ ] **Task 13 — `/companies/invitations/[token]` flow.** Public-token-gated landing.
  - If not signed in: show "You've been invited to join Acme Corp. Sign in to accept." with OTP form.
  - If signed in: show accept/decline buttons + invitation metadata (role, inviter).
  - Action `acceptInvitation(token)`: resolves invitation → transaction → `addMember(companyId, userId, role)` + `markAccepted(invitationId, userId)`. Sends "welcome to Acme" email.
  - Edge case: signed-in user's email differs from invitation email — show a warning but allow accept (the OTP step proves email control during sign-in; an admin can revoke later).

### Admin verification queue

- [ ] **Task 14 — Admin `/admin/companies` list.** Tabs: Pending verification / Active / Suspended. Click row → admin detail.

- [ ] **Task 15 — Admin company detail.** Shows the ANAF data + member roster + claimed event-requests count. Actions:
  - `verifyCompany(id)` — flips status to active, sets `verified_by_user_id`, sends `CompanyVerifiedEmail` to the owner.
  - `declineCompany(id, reason)` — flips status to suspended (or a new `rejected` enum value — needs a 0011 migration if so), sends rejection email.
  - Reuse the suspension-cascade pattern from `src/app/admin/(gated)/restaurants/[id]/actions.ts` (Task 32 of Phase 1) — `suspendCompany` should cascade-cancel outstanding event_requests where company_id matches.

### Polish + integration

- [ ] **Task 16 — Header dropdown.** Authenticated header gets a "Companies" dropdown when the user has ≥1 `company_members` row. Links to each company's dashboard.

- [ ] **Task 17 — Email templates.** `CompanyInvitationEmail` (RO + EN), `CompanyVerifiedEmail` (RO + EN). Snapshot tests in `src/emails/__tests__/Company.snapshots.test.tsx`. Both wired through the existing `lib/email/event-requests.ts` dispatcher (rename to `lib/email/index.ts` or `lib/email/dispatcher.ts` if you want to avoid surprise).

- [ ] **Task 18 — E2E happy path** (Playwright, un-skip after Phase 1's USE_DB=true bug is unblocked):
  1. Sign up new user via OTP.
  2. Submit company signup wizard with a valid CUI.
  3. Auto-verification succeeds (domain match seeded into ANAF mock).
  4. Dashboard renders the "We attached N requests" banner.
  5. Invite a teammate, accept invitation in a second browser context, verify member shows up.

- [ ] **Task 19 — Docs.** Update `docs/superpowers/specs/2026-05-13-corporate-bookings-design.md`'s "Status" table (or add one) to mark Phase 2a complete. Add a note pointing to this plan from the spec's Phase 2 section.

- [ ] **Task 20 — Final review.** Use `superpowers:requesting-code-review` on the whole branch range. Run `superpowers:finishing-a-development-branch`.

---

## Verification

- Every repo task ships with at least one integration test against the local Supabase Postgres.
- RLS tests in Task 5 are the canonical correctness check for Phase 2a — they must all pass before merge.
- The end-to-end test in Task 18 is gated behind the same USE_DB=true blocker as Phase 1's E2E; if still unresolved, ship without it but explicitly note in the merge commit.
- Manual smoke list (do before tagging the branch as ready):
  - Submit a valid CUI; expect auto-verification when email domain matches ANAF data.
  - Submit a CUI without domain match; expect manual-queue state and admin review surface.
  - Invite via dashboard; accept in a separate session; verify role + visibility.
  - Suspend a company in admin; verify outstanding event_requests get cascaded.
  - Pre-Phase-1 event request was tagged with a CUI; after signup, dashboard shows it under "attached" with company_id populated.

---

## Migration / Deploy Bookkeeping

- `0010_company_invitations_rls.sql` is the only new migration. Follow the [[deploy_setup]] convention (manual psql apply, insert into `drizzle.__drizzle_migrations` with sha256 hash + ms epoch, regenerate `_journal.json` + `0010_snapshot.json`).
- Coolify redeploy required after merge so the new routes (`/companies/...`, `/admin/companies/...`) go live.

---

## Open questions

1. **Verified domain strategy.** ANAF doesn't always return a registered web/email domain; the auto-verification rule may have a low hit rate. Acceptable to start with a low auto-rate and lean on admin manual review for the first 90 days?
2. **Invitation expiry.** Default 7 days? Configurable by company admin?
3. **Last-owner removal.** Do we enforce "must have ≥1 owner per company"? Yes by default; reject the action with a clear error.
4. **Role granularity.** owner / admin / booker / viewer — does Phase 2a need all four, or can `booker` and `viewer` collapse into one ("member") until Phase 2b's BookingTypeChips ships?
