# §01 MFA foundational layer (phase 1 of N)

**Date:** 2026-05-22
**Wave:** 2
**Spec source:** `docs/superpowers/architecture/01-identity-and-accounts.md` §5a.2 + foundations §5.2.

---

## Problem

The spec mandates TOTP MFA available from v1 for all staff accounts and **mandatory** for `tavli_admin` (admin sign-in must refuse to complete without an enrolled TOTP factor). Today there's no MFA infrastructure at all — neither wrapper helpers around Supabase Auth's MFA surface nor tests of the canonical enroll/verify/unenroll flow.

Shipping the FULL MFA feature (backend + sign-in enforcement + `/admin/security` + `/partner/security` UI) in one turn would force one of two anti-patterns:
1. Ship sign-in enforcement before the enrollment UI exists → admin sign-in breaks (redirect to nonexistent page).
2. Ship a half-aesthetic UI that violates the editorial bar (per `feedback_aesthetic_bar`).

**This unit splits the work:** ship the foundational helper layer + audit + tests now. A follow-up frontend-design unit ships the UI and wires sign-in enforcement together. The build-order item gets annotated "phase 1" rather than fully closed.

## Goal

A small, well-tested wrapper module that the upcoming UI will call. All side-effects (enroll/verify/unenroll) audit-logged via the existing `AUDIT.auth.mfa_*` keys (already in the registry from Wave 1). No behavioral changes to admin/partner sign-in yet.

## Non-goals

- **Sign-in enforcement for tavli_admin** — deferred to the UI follow-up (the enforcement needs a `/admin/security` page to redirect to).
- **UI pages** (`/admin/security`, `/partner/security`) — deferred. Frontend-design skill will own them.
- **Challenge flow for already-enrolled admins** (the AAL1→AAL2 step on every fresh sign-in) — deferred with the UI.
- **WebAuthn / passkeys** — deferred to v1.5 per spec §5a.2.
- **Recovery codes UI** — Supabase manages recovery codes server-side; the partner-facing surface to view/regenerate is part of the UI follow-up.
- **Impersonation MFA gate** — impersonation is its own unit; the MFA-can't-bypass requirement gets enforced when that unit ships.

## Architecture

One new helper module + one test file. No DB migration (Supabase Auth owns `auth.mfa_factors`). No UI. Single commit.

### `src/lib/auth/mfa.ts` — new helper

Thin wrappers around Supabase Auth's MFA surface, with audit + sane error shapes. Each helper takes a `SupabaseClient` so the caller (server action, route handler) injects its server-context client. Tests inject a structural mock.

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface EnrolledFactor {
  id: string;
  friendlyName: string | null;
  status: "verified" | "unverified";
  createdAt: string;
}

export interface EnrolTotpResult {
  ok: true;
  factorId: string;
  qrCodeSvg: string;     // Supabase returns SVG QR; pass straight through
  uri: string;            // otpauth:// URI for paste-into-authenticator
  secret: string;         // base32 secret for manual entry
} | { ok: false; error: string };

export interface VerifyTotpResult {
  ok: true;
} | { ok: false; error: string };

export async function enrolTotpFactor(
  supabase: SupabaseClient,
  friendlyName?: string,
): Promise<EnrolTotpResult>;

export async function verifyTotpEnrollment(
  supabase: SupabaseClient,
  factorId: string,
  code: string,
  userIdForAudit: string,
): Promise<VerifyTotpResult>;

export async function unenrollFactor(
  supabase: SupabaseClient,
  factorId: string,
  userIdForAudit: string,
): Promise<{ ok: boolean; error?: string }>;

export async function listVerifiedTotpFactors(
  supabase: SupabaseClient,
): Promise<EnrolledFactor[]>;

export async function userHasVerifiedFactor(
  supabase: SupabaseClient,
): Promise<boolean>;
```

**Behavior notes:**
- `enrolTotpFactor` calls `supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName })`. Does NOT audit (enrollment is not committed — only verification is). Returns the QR + secret for the UI to display.
- `verifyTotpEnrollment` calls `supabase.auth.mfa.challenge()` then `supabase.auth.mfa.verify()`. On success, records `AUDIT.auth.mfa_enrolled` with `subjectType: 'user', subjectId: userId`. The `userIdForAudit` argument is the authenticated user's id (caller already has it; passing explicitly avoids a second `getUser()` call).
- `unenrollFactor` calls `supabase.auth.mfa.unenroll({ factorId })`. On success, records `AUDIT.auth.mfa_disabled`.
- `listVerifiedTotpFactors` returns only `factorType === 'totp' && status === 'verified'` factors (the UI cares about verified ones; unverified are enrollment-in-progress garbage).
- `userHasVerifiedFactor` is a thin convenience that the upcoming sign-in enforcement will call.

**Audit format** (mirroring the patterns from §02 audit retrofit):
```ts
await recordAudit({
  action: AUDIT.auth.mfa_enrolled,
  subjectType: "user",
  subjectId: userId,
  actorUserId: userId,
  actorRole: "venue_owner",  // approximated — see Risk below
  context: { factor_type: "totp", factor_id: factorId },
});
```

ActorRole: MFA is a self-service flow (the user acts on their own account). The audit row says "this user enrolled/disabled MFA on themselves." The right ActorRole would be derived via `getActorRole(session, ...)` — but `getActorRole` needs a `restaurantId` and MFA isn't restaurant-scoped. For phase 1, use `"venue_owner"` as a conservative default since partner accounts are all venue_owners under current data; flag in the helper comment as a known imprecision. The UI follow-up unit refines this.

### Tests (`src/lib/auth/__tests__/mfa.test.ts`)

6 cases via a structural mock of `SupabaseClient.auth.mfa`:

1. `enrolTotpFactor` happy path → returns `factorId`, `qrCodeSvg`, `uri`, `secret`.
2. `enrolTotpFactor` Supabase error → returns `{ ok: false, error }`.
3. `verifyTotpEnrollment` happy path → challenges, verifies, audits.
4. `verifyTotpEnrollment` invalid code → returns error, does NOT audit.
5. `unenrollFactor` happy path → audits `mfa_disabled`.
6. `listVerifiedTotpFactors` filters out unverified + non-TOTP factors.

Tests mock the `recordAudit` import via `jest.mock("@/lib/audit/record")`.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npx jest src/lib/auth` — green (5 password-policy + 6 new MFA = 11 tests).
3. `npm run lint 2>&1 | tail -5` — 14-error baseline.
4. `npm run build` — green.

## Risk summary

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Supabase Auth's MFA API surface changes between versions | Low | Med | Pinned `@supabase/supabase-js@^2.103.3` + `@supabase/ssr@^0.10.2`. Tests use structural mocks so API drift would surface immediately. |
| `actorRole` imprecision in audit rows | Expected | Low | Documented as "phase 1 known imprecision"; UI follow-up refines by passing the resolved role. |
| Build-order item annotation reads as fully closed when it isn't | Low | Low | Annotation explicitly says "phase 1 of N — UI follow-up pending." Future-Claude reading the build-order won't be misled. |
| MFA QR code rendering in test environment | None | None | Tests don't render; they verify the helper's return shape. UI follow-up handles QR display. |

## Commit shape

Single commit:
- `src/lib/auth/mfa.ts` (new, ~140 lines)
- `src/lib/auth/__tests__/mfa.test.ts` (new, ~150 lines)

```
feat(auth): MFA foundational layer per §01 §5a.2 (phase 1 — backend wrappers + audit)
```

No migration. No UI. No behavior change to existing sign-in flows.
