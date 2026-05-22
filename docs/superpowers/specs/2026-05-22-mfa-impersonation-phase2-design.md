# §01 MFA + Impersonation phase 2 (UI + enforcement)

**Date:** 2026-05-22
**Wave:** 2
**Spec source:** `docs/superpowers/architecture/01-identity-and-accounts.md` §5a.2, §5a.3, §5a.4 + foundations §5.
**Pairs with:** `2026-05-22-mfa-foundational-layer-design.md` (phase 1, shipped) and the impersonation primitives shipped in `src/lib/auth/impersonation.ts`.

---

## Problem

Phase 1 shipped the MFA helper layer (`src/lib/auth/mfa.ts`) and impersonation audit primitives (`src/lib/auth/impersonation.ts`). The build-order items §01 MFA and §01 impersonation are still open at phase 2 — they need the user-facing surface and the runtime mechanism that ties everything together. Specifically:

- No `/admin/security` or `/partner/security` page exists yet, so users can't enrol TOTP, see factors, view recovery codes, change passwords, or sign out everywhere.
- Admin sign-in does not enforce MFA. §5a.2 says admin sign-in must refuse to complete without an enrolled factor.
- No `/admin/users` page exists. Admins have no UI to start an impersonation session.
- No session-cookie mechanism for impersonation context — the audit primitives exist but no one can call them.
- The persistent red partner-side banner doesn't exist.
- Existing `recordAudit` callsites don't thread `impersonatorUserId` from session context.

This unit closes both phase-2 build-order items in one umbrella design, three sequential sub-units, three commits.

## Goal

Ship a coherent identity+support surface:
1. Self-service MFA + password + session control at `/admin/security` and `/partner/security`.
2. Multi-step sign-in (password → TOTP) on both `/admin/sign-in` and `/partner/sign-in` when a factor exists.
3. Forced TOTP enrolment for admins who haven't yet (enforced by proxy).
4. Recovery codes available to anyone with TOTP (10 codes; consumption unenrols factors and forces re-enrol).
5. `/admin/users` rich list with search, MFA badges, last-impersonated indicator, audit drawer, and an "Impersonate" CTA.
6. Real-session-swap impersonation with an AES-256-GCM-encrypted return-ticket cookie carrying the admin's tokens (GCM auth tag protects against tampering).
7. Persistent red banner on partner pages whenever an impersonation session is active, with inline "Stop impersonating" control.
8. Audit retrofit: 7 callsites thread `impersonatorUserId` via a new `currentActor()` helper.

## Non-goals

- **Passkeys / WebAuthn** — deferred to v1.5 per §5a.2.
- **Multi-factor selection UX** at sign-in when a user has multiple verified factors — take the first; selection UI is a follow-up polish.
- **Reads-during-impersonation auditing** — only mutation callsites are retrofitted. The impersonation_started/ended bookends are sufficient per existing convention.
- **Admin-cross-redirect during impersonation** — if an admin navigates to `/admin/*` while in an impersonation session, the proxy redirects to `/admin/sign-in` (role check fails). A polished "stop impersonating to access admin" message is v1.5.
- **Session-token store** — return cookie carries encrypted tokens directly; no server-side session store.

## Architecture overview

Three sub-units, three commits, all-or-nothing per sub-unit (tsc + tests + manual smoke clean before commit):

| Sub-unit | Domain | New routes | New migrations |
|---|---|---|---|
| **A** — MFA UI + sign-in enforcement + recovery codes + currentActor scaffolding | self-service security, sign-in multi-step, forced enrol, AAL2 gate | `/admin/security`, `/partner/security` | `0020_mfa_recovery_codes` |
| **B** — Impersonation UI + real session swap | admin-side trigger + runtime mechanism + banner | `/admin/users` | none |
| **C** — Audit retrofit | thread `impersonatorUserId` through existing mutation callsites | none | none |

Order matters: A introduces the cookie reader (`currentActor`) and the cookie utilities that B will write into; C is the cleanup retrofit of pre-existing code that benefits from the cookie B starts populating.

---

## Sub-unit A — MFA UI + sign-in enforcement + recovery codes

### Migration `0020_mfa_recovery_codes`

```sql
BEGIN;

CREATE TABLE mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash varchar(64) NOT NULL UNIQUE,             -- sha-256 hex; matches 0018 convention
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mfa_recovery_codes_user_active
  ON mfa_recovery_codes(user_id, consumed_at);

ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- §3.7 RLS pattern: narrow SELECT for self, no FOR ALL mutate policy.
CREATE POLICY mfa_recovery_codes_select_self ON mfa_recovery_codes
  FOR SELECT
  USING (user_id = auth.uid());

COMMIT;
```

Drizzle mirror: `src/lib/db/schema/mfa-recovery-codes.ts`. Bookkeeping insert via the established 3-step convention (see `~/.claude/projects/.../memory/deploy_setup.md`).

### New helpers

**`src/lib/auth/crypto.ts`** — AES-256-GCM helpers using `node:crypto` stdlib. No new dep.
```ts
encryptAesGcm(plaintext: string, keyBase64: string): string  // returns base64url
decryptAesGcm(payload: string, keyBase64: string): string | null  // null on tamper
```

**`src/lib/auth/impersonation-cookie.ts`** — read/decrypt utility for the return cookie.
```ts
interface ImpersonationReturnPayload {
  v: 1;
  adminUserId: string;
  adminEmail: string;
  targetUserId: string;
  targetEmail: string;
  startedAt: string;       // ISO 8601
  adminAccessToken: string;
  adminRefreshToken: string;
}
readImpersonationReturnCookie(): Promise<ImpersonationReturnPayload | null>
```
Reads `tavli_impersonation_return` cookie via `next/headers.cookies()`, decrypts with `IMPERSONATION_COOKIE_SECRET`, validates shape (v === 1). Decryption failure → null.

**`src/lib/auth/current-actor.ts`** — DI-seam factory matching established pattern.
```ts
makeCurrentActor(deps: { readImpersonationReturnCookie: () => Promise<ImpersonationReturnPayload | null> })
currentActor(actorUserId: string): Promise<{ actorUserId: string; impersonatorUserId: string | null }>
```
If cookie present, returns `{ actorUserId, impersonatorUserId: cookie.adminUserId }`. Otherwise `{ actorUserId, impersonatorUserId: null }`. Tests inject a structural mock.

**`src/lib/auth/aal.ts`** — `requireAAL2(supabase)` wraps `getAuthenticatorAssuranceLevel()` for use in server actions that need AAL2 confirmation (currently only used by `startImpersonationSession` in sub-unit B; included here for completeness).

**`src/lib/auth/mfa.ts` extensions** — add to existing module:
```ts
generateRecoveryCodes(supabase: SupabaseClient, userId: string): Promise<string[]>
  // Returns 10 plaintext codes ONCE. Transaction: DELETE existing rows for user_id,
  // INSERT 10 new rows with sha-256(code) as code_hash. Writes audit
  // AUDIT.user.mfa_recovery_codes_regenerated with currentActor threading.

consumeRecoveryCode(supabase: SupabaseClient, userId: string, code: string): Promise<{ ok: true; remaining: number } | { ok: false }>
  // SHA-256 input. Match unconsumed row for user_id.
  // On match: UPDATE consumed_at = now(), THEN unenrol all TOTP factors via service-role
  // (recovery code means "lost authenticator"), audit AUDIT.user.mfa_recovery_code_consumed
  // with currentActor threading, audit one mfa_disabled per factor.

countUnconsumedRecoveryCodes(supabase: SupabaseClient, userId: string): Promise<number>

changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }>
  // Validates currentPassword via a transient anon-key Supabase client
  // (createClient without cookie binding) — preserves user's session.
  // Runs password-policy check (existing helper).
  // Calls supabase.auth.updateUser({ password }) on user's real session
  // (rotates JWT material per §5a.4). Records AUDIT.auth.password_reset_completed
  // with currentActor threading. Auto-signOut + redirect to sign-in after.

signOutEverywhere(): Promise<void>
  // supabase.auth.signOut({ scope: 'global' }) — invalidates all refresh tokens for the user.
  // Audit AUDIT.user.signed_out_everywhere with currentActor threading.
  // Redirect to /<scope>/sign-in.
```

Code format: 10 chars from alphabet `abcdefghjkmnpqrstuvwxyz23456789` (no ambiguous glyphs), displayed `xxxx-xxxx-xx`. Hash: sha-256 hex of the plaintext (no salt — 10 chars of 31-symbol alphabet = ~50 bits entropy, sufficient against guessing; hashes globally unique per user via the `UNIQUE` constraint).

### Audit registry additions (`src/lib/audit/actions.ts`)

```ts
AUDIT.user.signed_out_everywhere
AUDIT.user.mfa_recovery_codes_regenerated
AUDIT.user.mfa_recovery_code_consumed
```

### Sign-in actions — multi-step

Current: `signInAdmin(prev, formData)` is one-shot.

After this unit, `signInAdmin` becomes:

```ts
type SignInResult =
  | { ok: true }   // redirects, never actually returned
  | { ok: false; error: string }
  | { ok: false; state: 'needs_mfa'; factorId: string; hasRecoveryCodes: boolean };

async function signInAdmin(prev, formData) {
  const mfaCode = formData.get('mfa_code');
  const recoveryCode = formData.get('recovery_code');
  const factorId = formData.get('factor_id');

  // Step 2 — MFA or recovery
  if (factorId && (mfaCode || recoveryCode)) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: '...' };

    if (mfaCode) {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) return needs_mfa_re_render(factorId, 'Try again.');
      const verify = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: mfaCode });
      if (verify.error) return needs_mfa_re_render(factorId, 'Incorrect code.');
      redirect('/admin');
    } else if (recoveryCode) {
      const result = await consumeRecoveryCode(supabase, user.id, recoveryCode);
      if (!result.ok) return needs_mfa_re_render(factorId, 'Recovery code invalid.');
      // Factors unenrolled inside consumeRecoveryCode; session is now AAL1 with no factors.
      redirect('/admin/security?enrol=required');
    }
  }

  // Step 1 — email + password
  const email = ...; const password = ...;
  if (!email || !password) return { ok: false, error: '...' };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: '...' };  // uniform error per §5a.1
  // role check (existing logic) ...

  const factors = await listVerifiedTotpFactors(supabase);
  if (factors.length > 0) {
    const remaining = await countUnconsumedRecoveryCodes(supabase, data.user.id);
    return { ok: false, state: 'needs_mfa', factorId: factors[0].id, hasRecoveryCodes: remaining > 0 };
  }

  redirect('/admin');
}
```

`signInPartner` follows the identical shape. Difference: partner has no forced-enrol; if no factor exists, normal sign-in completes at AAL1.

Sign-in form (client component, `useFormState`-driven): renders email/password when state is initial or `{ok:false, error}`. Switches to TOTP input + "Use a recovery code" toggle when state is `{state: 'needs_mfa'}`. Hidden `factor_id` field carries the id back on submit.

### Proxy diff (`src/proxy.ts`)

After role check, before passing the request through:

```ts
const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
// aal.currentLevel: 'aal1' | 'aal2'
// aal.nextLevel: 'aal1' | 'aal2'

// Forced enrolment for admins (only — partner is voluntary)
if (needsAdmin) {
  const adminEnrolAllow = ['/admin/sign-in', '/admin/security', '/admin/sign-out'];
  if (aal.nextLevel === 'aal1' && !adminEnrolAllow.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/admin/security?enrol=required', request.url));
  }
}

// AAL2 gate (both admin and partner)
if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
  const scope = needsAdmin ? 'admin' : 'partner';
  const signInAllow = [`/${scope}/sign-in`, `/${scope}/sign-out`];
  if (!signInAllow.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL(`/${scope}/sign-in?continue_mfa=1`, request.url));
  }
}
```

Sign-in page detects `continue_mfa=1` and skips straight to the MFA step using the current AAL1 session.

### `/partner/security` page (editorial layout per chosen direction A)

Layout: single-column, max-width ~640px centered, serif headings, generous spacing. Sections:

1. **Two-factor authentication**
   - Heading + body copy: "A second factor on your account means a stolen password isn't enough to sign in."
   - If no verified factor: large "Set up authenticator" CTA → reveals QR (from `enrolTotpFactor`), manual-entry secret, 6-digit input → `verifyTotpEnrollment` → on success show factor card + auto-nudge "Generate recovery codes now?"
   - If verified factor: factor card (friendly name, created date, "Remove" → confirm + `unenrollFactor` after re-auth prompt)
2. **Recovery codes** (rendered only when a verified factor exists)
   - "X of 10 codes remaining" (`countUnconsumedRecoveryCodes`)
   - "Generate new codes" button → confirmation that existing codes will be invalidated → `generateRecoveryCodes` returns 10 plaintext codes → display in copy-able block + "Download as .txt" button. Codes are unrecoverable after navigation.
3. **Password**
   - "Last changed: <relative time>" (from auth.users.updated_at or audit_logs lookup)
   - "Change password" → modal: current / new / confirm fields → `changePassword`
4. **Active sessions**
   - "Sign out everywhere" CTA → confirmation → `signOutEverywhere`

Each section is its own component under `src/app/partner/(dashboard)/security/_components/`. Reused by `/admin/security` inside a sans-serif admin wrapper.

### `/admin/security` page (functional)

Same section components inside the standard admin layout (sans-serif, tighter rhythm, no editorial flourishes). One important behavioural difference: if landed with `?enrol=required`, render a banner at top: "Two-factor authentication is required for admin access. Set up an authenticator app to continue." No nav links visible until enrolled (the proxy keeps them stuck here regardless).

### Files (sub-unit A)

**New:**
- `drizzle/migrations/0020_mfa_recovery_codes.sql`
- `src/lib/db/schema/mfa-recovery-codes.ts`
- `src/lib/auth/crypto.ts`
- `src/lib/auth/impersonation-cookie.ts`
- `src/lib/auth/current-actor.ts`
- `src/lib/auth/aal.ts`
- `src/app/admin/(gated)/security/page.tsx`
- `src/app/admin/(gated)/security/actions.ts`
- `src/app/partner/(dashboard)/security/page.tsx`
- `src/app/partner/(dashboard)/security/actions.ts`
- `src/app/partner/(dashboard)/security/_components/TwoFactorSection.tsx`
- `src/app/partner/(dashboard)/security/_components/RecoveryCodesSection.tsx`
- `src/app/partner/(dashboard)/security/_components/PasswordSection.tsx`
- `src/app/partner/(dashboard)/security/_components/SessionsSection.tsx`
- Tests for each new module + page action

**Modified:**
- `src/lib/auth/mfa.ts` — adds the 5 new functions listed above
- `src/lib/audit/actions.ts` — adds 3 registry entries
- `src/app/admin/sign-in/actions.ts` — multi-step
- `src/app/admin/sign-in/sign-in-form.tsx` — multi-step
- `src/app/partner/sign-in/actions.ts` — multi-step
- `src/app/partner/sign-in/sign-in-form.tsx` — multi-step (if it exists; create if not)
- `src/proxy.ts` — forced-enrol + AAL2 gate
- `.env.local.example` — `IMPERSONATION_COOKIE_SECRET`

**Sub-unit A commit:** one commit per the established A/B/C pattern. All-or-nothing; tsc clean; tests pass; manual smoke clean.

---

## Sub-unit B — Impersonation UI + real session swap

### Service-role client

**`src/lib/db/service-role.ts`** — new factory.

```ts
import { createClient } from '@supabase/supabase-js';
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
```

Used by: impersonation start/stop, `/admin/users` server component data fetch (auth.users is RLS-hidden from anon sessions), `consumeRecoveryCode` force-unenrol path (already in A, but uses the same client created here).

### `src/lib/auth/impersonation-session.ts`

```ts
async function startImpersonationSession(targetUserId: string, reason?: string): Promise<void>
async function stopImpersonationSession(): Promise<void>
```

**Start sequence** (one server action, all-or-nothing):

```
1.  admin = createSupabaseServerClient(); user = admin.getUser()
2.  assert profile.role === 'admin' && AAL.currentLevel === 'aal2'
3.  assert targetUserId !== adminUser.id   (no self-impersonation)
4.  capture { adminAccessToken, adminRefreshToken } from admin.getSession()
5.  serviceRole.auth.admin.getUserById(targetUserId) → target (with email)
6.  recordImpersonationStart({ adminUserId, targetUserId, reason })
7.  serviceRole.auth.admin.generateLink({ type: 'magiclink', email: target.email })
    → { properties.hashed_token }
8.  cookieStore.delete('tavli_active_org')   (avoid org-context bleed; §7 self-corrects but explicit)
9.  admin.auth.signOut()    (clears Supabase Auth cookies)
10. admin.auth.verifyOtp({ token_hash, type: 'magiclink' })
        → mints target session, sets target cookies
    On failure: setSession({ adminAccessToken, adminRefreshToken }) to restore admin, then throw
11. encrypt JSON payload (v:1, ids, emails, startedAt, adminTokens) with IMPERSONATION_COOKIE_SECRET
12. cookieStore.set('tavli_impersonation_return', encrypted, {
      httpOnly: true, secure: true, sameSite: 'strict',
      path: '/', maxAge: 4 * 60 * 60
    })
13. redirect('/partner')
```

**Stop sequence**:

```
1.  payload = readImpersonationReturnCookie()
    if null → supabase.signOut() + redirect('/admin/sign-in?session_expired=1')
2.  recordImpersonationEnd({ adminUserId, targetUserId })
3.  supabase.auth.signOut()                 (clears target cookies)
4.  supabase.auth.setSession({ access_token: adminAccessToken, refresh_token: adminRefreshToken })
    On error (stale refresh chain):
      cookieStore.delete('tavli_impersonation_return')
      redirect('/admin/sign-in?session_expired=1')
5.  cookieStore.delete('tavli_impersonation_return')
6.  redirect('/admin/users')
```

### `/admin/users` page

Route: `src/app/admin/(gated)/users/page.tsx`. URL state: `?q=<email-search>&selected=<userId>`.

Server component reads search params, queries via service-role:
- `profiles JOIN auth.users` (last_sign_in_at), `LEFT JOIN auth.mfa_factors` (status='verified' count), `LEFT JOIN audit_logs subquery` for last `user.impersonation_started` per user.
- Where `email ILIKE '%' || q || '%'`, order by `created_at DESC`, limit 100.

When `?selected=<id>`, also query:
- Org memberships for that user.
- restaurant_staff rows.
- Last-50 audit_logs where `subject_id = id OR actor_user_id = id`.

Layout:
```
┌──────────────────────────────────────────────────────────────┐
│  Users                          [Search by email_________]    │
├──────────────────────────────────────────────────────────────┤
│  Email           Role        MFA   Last sign-in   Last imp.  │
│  alice@x.com     rest_owner  ✓     2h ago         2d ago     │ [Impersonate]
│  bob@y.com       admin       ✓     5 min ago      —          │ [Impersonate]
│  ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

Click row → `?selected=<id>` → right-slide drawer (client component, controlled by URL param):
- Header: email, role, created_at
- Org memberships block
- restaurant_staff block
- MFA factors block
- Audit timeline (last 50, each row: ts · action · actor (or actor + "impersonated by " + impersonator) · context summary)
- Top of drawer: [Impersonate] CTA

### Impersonate modal

`src/app/admin/(gated)/users/_components/ImpersonateModal.tsx` — client component opened from any [Impersonate] button.

```
Title:   Impersonate alice@x.com
Body:    You'll see Tavli as alice@x.com sees it. Every action will be
         audit-logged showing both your identity and the user you're
         impersonating.
Reason:  [textarea, max 200 chars, placeholder: "Investigating booking issue ALC-1042"]
         (optional but encouraged)

         [Cancel]              [Start impersonating →]
```

Submit calls `startImpersonationSession(targetUserId, reason)` via form action.

### Banner

`src/components/banners/ImpersonationBanner.tsx` — server component fragment.

```tsx
const cookie = await readImpersonationReturnCookie();
if (!cookie) return null;

return (
  <div
    role="alert"
    aria-live="polite"
    className="fixed top-0 inset-x-0 z-50 h-12 bg-red-600 text-white"
  >
    <div className="flex items-center justify-between h-full px-4 max-w-screen-2xl mx-auto">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertCircleIcon className="h-4 w-4" />
        <span>Tavli support viewing this account as {cookie.adminEmail}</span>
        <span className="opacity-70">·</span>
        <span>Acting as {cookie.targetEmail}</span>
        <span className="opacity-70">·</span>
        <span>Started {relativeTime(cookie.startedAt)}</span>
      </div>
      <form action={stopImpersonationSession}>
        <button type="submit" className="...">Stop impersonating →</button>
      </form>
    </div>
  </div>
);
```

Layout wiring in `src/app/partner/(dashboard)/layout.tsx`: render `<ImpersonationBanner />` at the top of the layout's children; wrap the rest in `<div className="pt-12">...</div>` conditionally when banner is present. Existing partner sticky nav's top offset adjusts via the same conditional.

Banner does not render in the admin layout (admin can't reach `/admin/*` during impersonation anyway; role check fails).

**Spec divergence note.** §5a.3 phrases the banner as visible to the partner: "the partner portal renders a persistent red banner... reading 'Tavli support is viewing your account as <admin email>.'" In a real-session-swap impersonation, the partner's own concurrent sessions are on separate refresh tokens and do **not** carry the return cookie — only the admin's hijacked session sees the banner. The banner copy `"Tavli support viewing this account as <adminEmail> · Acting as <targetEmail>"` satisfies the spec text from the admin's perspective (they see who they are signing in as) and identifies the support actor (per spec wording). A partner-side notification — appearing on the partner's real sessions while impersonation is active — would require a separate `impersonation_active_sessions` table queried by the partner layout. Out of scope for v1; flagged as a candidate v1.5 enhancement.

### Files (sub-unit B)

**New:**
- `src/lib/db/service-role.ts`
- `src/lib/auth/impersonation-session.ts`
- `src/app/admin/(gated)/users/page.tsx`
- `src/app/admin/(gated)/users/actions.ts`
- `src/app/admin/(gated)/users/_components/UsersTable.tsx`
- `src/app/admin/(gated)/users/_components/UserDrawer.tsx`
- `src/app/admin/(gated)/users/_components/ImpersonateModal.tsx`
- `src/components/banners/ImpersonationBanner.tsx`
- Tests for each module + page

**Modified:**
- `src/app/partner/(dashboard)/layout.tsx` — banner injection + padding
- `.env.local.example` — confirm `SUPABASE_SERVICE_ROLE_KEY`

**Sub-unit B commit:** all-or-nothing; tsc clean; tests pass; manual smoke clean.

---

## Sub-unit C — Audit retrofit

Pattern at each callsite:

```diff
+ const actor = await currentActor(actorUserId);
  await recordAudit({
    action: AUDIT.<x>,
    subjectType: '...',
    subjectId: ...,
-   actorUserId,
+   actorUserId: actor.actorUserId,
+   impersonatorUserId: actor.impersonatorUserId ?? undefined,
    actorRole,
    context: { ... },
  });
```

### Retrofit list (7 sites)

1. `src/app/api/event-requests/actions.ts:446` — event-request respond
2. `src/app/partner/(dashboard)/reservations/actions.ts:53` — reservation create
3. `src/app/partner/(dashboard)/reservations/actions.ts:177` — reservation update
4. `src/app/partner/(dashboard)/reservations/export-actions.ts:232` — reservation export
5. `src/app/api/reservations/actions.ts:139` — API reservation create
6. `src/lib/auth/mfa.ts:90` — verifyTotpEnrollment audit (mfa_enrolled)
7. `src/lib/auth/mfa.ts:110` — unenrollFactor audit (mfa_disabled)

### Skips (documented)

- `src/app/event-requests/[token]/actions.ts:152` — diner-side token flow. Diner cannot be impersonated by an admin in v1.
- `src/app/reservations/[token]/actions.ts:55` — same.

### Test updates

Existing tests for each retrofitted callsite already mock `recordAudit`. Add assertions:
- When `currentActor` is configured (in the test) to return `impersonatorUserId: null`, the recordAudit call has `impersonatorUserId` undefined or absent.
- When `currentActor` is configured to return `impersonatorUserId: '<admin-id>'`, the recordAudit call has that value.

DI seam: each test substitutes the production `currentActor` import for a test double.

### Files (sub-unit C)

**Modified:** the 7 callsite files above + their tests.
**New:** none.

**Sub-unit C commit:** all-or-nothing; tsc clean; tests pass.

---

## Cross-cutting decisions

### Cookie design

`tavli_impersonation_return` — AES-256-GCM encrypted (not just HMAC-signed) because the payload contains the admin's session tokens. Auth tag protects against tampering. Cookie attributes: HttpOnly, Secure, SameSite=Strict, path=/, maxAge=4h.

Approximate size: ~2.5–3KB after base64url-encoded ciphertext. Single cookie suffices (4KB browser limit).

### AAL detection

Use `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` everywhere it suffices — it inspects the JWT locally, no network. Only fall back to `listFactors()` when accuracy matters mid-mutation (e.g., the security page's render of "is the user enrolled?").

### Email-enumeration posture

Multi-step sign-in returns `needs_mfa` only when the password is correct AND a verified factor exists. The "needs_mfa vs success" branching reveals "does this user have MFA?" to anyone who already knows the correct password — minor oracle, no email-validity leak. Per-§5a.1 the password-wrong path remains uniform with "unknown email" (Supabase's `signInWithPassword` returns generic `Invalid credentials`).

### Password change re-auth

Standard Supabase `auth.reauthenticate()` uses an email nonce — too heavy. Use a transient `createClient` (anon key, no cookie binding) to validate the current password via `signInWithPassword(email, currentPassword)`. The transient client's session is in-memory only; the user's real session is untouched. After validation, call `supabase.auth.updateUser({ password })` on the real session — which rotates JWT signing material per §5a.4. Auto-signOut + redirect to sign-in with success message.

### `tavli_active_org` cookie during impersonation

Admin's active_org cookie may carry over to the target. §7's self-correction handles it (cookie pointing to a wrong org gets cleared on first request). Belt-and-braces: explicitly delete the cookie at startImpersonationSession step 8.

### Banner accessibility

`role="alert" aria-live="polite"`; white-on-red-600 (passes 4.5:1 contrast); focus indicator on the Stop button. Banner content reads naturally to a screen reader.

---

## New env vars (`.env.local.example`)

```bash
# AES-256-GCM key for the impersonation return cookie (sub-unit B).
# Generate: openssl rand -base64 32
IMPERSONATION_COOKIE_SECRET=

# Required for service-role operations: admin user list, magic-link generation
# during impersonation, factor unenrol during recovery code consumption.
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Testing strategy

### Unit (per sub-unit)

- **A:** crypto round-trip + tamper + bad-key; impersonation-cookie reader; currentActor with/without cookie; recovery code generate (transactional reset + plaintext-once) + consume (hash match, unenrol cascade, audit) + count; AAL2 helper; multi-step sign-in state machine (both admin and partner; happy path, wrong code, recovery-code path); changePassword (transient client validation, updateUser, audit); signOutEverywhere.
- **B:** impersonation-session.start (mocks for service-role, admin client, cookies, recordAudit — assert audit, cookie shape, target session minted, failure recovery); .stop (audit, signOut, restore success, stale-refresh fallback); /admin/users data fetch (mock db + service-role); ImpersonateModal (form submit, reason length validation); ImpersonationBanner (renders only when cookie present, accessibility attributes).
- **C:** the 7 retrofitted callsites — each test asserts `impersonatorUserId` is populated when currentActor returns it + null otherwise.

### Integration

- Proxy: forced-enrol for admin without factor → redirected to /admin/security?enrol=required.
- Proxy: AAL1+factor → redirected to /<scope>/sign-in?continue_mfa=1.
- Proxy: target session (during impersonation) + return cookie → partner pages render banner.
- Stop: admin restored at AAL2 (happy path); admin re-signed-in (stale refresh fallback).

### Manual smoke

Per sub-unit, before commit:
- **A:** admin enrols TOTP on /admin/security → sign out → sign in: password step + TOTP step → land at /admin. Sign in with recovery code → factors unenrolled, redirected to /admin/security?enrol=required, re-enrolment loop. Partner enrols on /partner/security → sign in with TOTP → land at /partner. Change password → forced sign-out → re-sign-in. Sign out everywhere → other devices invalidated (verify by trying to use a stale session cookie).
- **B:** admin /admin/users → search alice → row click → drawer renders with audit history → [Impersonate] modal → reason → land at /partner with red banner showing admin email + target email + started time → click Stop → admin restored at /admin/users.
- **C:** while impersonating, mutate (reservation update) → query audit_logs → row has `actor_user_id = target.id`, `impersonator_user_id = admin.id`, `action = 'reservation.updated'`.

---

## Known limitations (documented)

- **Impersonation 4h cap.** Cookie maxAge = 4h. If a session exceeds this, the cookie is dropped; banner disappears; admin loses the return ticket and must sign in again to restore admin context. Rare in practice (support sessions are short).
- **Refresh-token staleness on stop.** If admin's captured refresh_token was rotated by activity in a parallel tab during impersonation, restoration fails. Graceful fallback: clear cookie + redirect to /admin/sign-in?session_expired=1. Admin re-signs-in (including MFA). Bounded by the fact that the proxy redirects admin tabs out of /admin/* during impersonation.
- **Admin lockout from /admin/* during impersonation.** Proxy's role check redirects /admin/* → /admin/sign-in because target's role is restaurant_owner. v1.5 polish: detect return cookie on /admin/* paths and redirect to /partner with explainer.
- **No reads-during-impersonation auditing.** Only the impersonation_started/ended bookends + the retrofitted mutation callsites are audited. Matches existing convention.
- **Multi-factor selection at sign-in.** Take the first verified factor. UI for choosing between multiple factors is v1.5.
- **Partner's own sessions don't see the banner.** §5a.3 phrases the banner as visible to the partner; in real-session-swap, only the admin's hijacked session carries the return cookie that triggers the banner. Server-side notification on the partner's own sessions is out of scope for v1; see the spec-divergence note in the Banner section.

---

## Commit plan handoff

Three sequential commits, each landing one sub-unit. Plan-execution will own the precise commit boundaries; this spec defines the sub-unit shape and the commit-A → commit-B → commit-C ordering.

After all three sub-units ship, build-order entries §01 MFA and §01 impersonation are annotated `[x]` (the "phase 2 pending" tag is removed).
