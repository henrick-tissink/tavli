# Tavli — launch conformance checklist

> **Status: DRAFT, for legal sign-off.** Maps each regulatory requirement Tavli
> is subject to (RO/EU market) to its implementing code/file + current status.
> Engineering keeps the "Implementation" and "Status" columns honest; the
> **legal sign-off itself is the operator's**. Drafted 2026-05-25.
>
> Status legend: ✅ implemented & tested · 🟡 implemented, needs verification /
> live config · ⛔ operator action required (not code) · ⬜ gap (file as a task).

## GDPR (Regulation (EU) 2016/679)

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Art. 6 lawful basis — consent for marketing, contract for transactional | `marketing_consents` (per-channel opt-in); transactional gated separately | ✅ |
| Art. 7 demonstrable consent + provenance | `marketing_consents` source_surface_url / source_ip / consent_copy_shown / consent_locale (Wave 7) + `marketing_consent_audit` | ✅ |
| Art. 7(3) withdraw as easily as given | RFC 8058 one-click unsubscribe `/u/[sendId]/[token]`; SMS STOP suffix (`send/stop-suffix.ts`) | 🟡 (email ✅; SMS inbound STOP handler is A10 — deferred, SMS off at launch) |
| Art. 12–14 transparency / privacy notice | `src/content/legal/*/privacy.mdx`, `data-processing.mdx` | ✅ (content) / ⛔ (legal review) |
| Art. 15 right of access (DSAR) | `dsr-actions.ts` intake + `compliance.dsarExport` job | 🟡 |
| Art. 16 rectification | partner diner-edit UI + self-serve booking edit | ✅ |
| Art. 17 erasure (cascade) | `pii-table-registry.ts` + handlers; `erasure-cascade.integration.test` covers diner + **non-diner** subjects (Phase C) | ✅ |
| Art. 17 — identifier-only (non-diner) erasure | `resolveDinersProd` appends DSR identifier → prospect_waitlist / event_requests / suppressions | ✅ |
| Art. 25 data-protection by design — PII access logging | `diner_pii_access_log` + 24-month purge (`purge-pii-access-log.ts`) | ✅ |
| Art. 28 sub-processors register + DPAs | `docs/operations/sub-processors.md` | 🟡 (register drafted) / ⛔ (DPAs signed) |
| Art. 30 records of processing | `data-processing.mdx` + this checklist | 🟡 |
| Art. 32 security — RLS, encryption at rest, least-privilege | Supabase RLS policies; `can()` matrix (`src/lib/authz`) | ✅ (RLS/authz) / ⛔ (infra hardening review) |
| Art. 32 transit security | TLS at the edge (Coolify/Hetzner) | ⛔ (operator) |
| Storage limitation — retention sweeps | `retention.ts` + 0046/0047 policies; cookie/rate-limit/PII-log purges | ✅ |
| DSR identity verification before erasure | `data_subject_requests.identity_verified` gate in orchestrator (TV1101) | ✅ |

## ANPC / Romanian consumer law (OUG 34/2014, Law 365/2002, OUG 141/2024 etc.)

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| ANPC contact + SAL/SOL (ADR/ODR) links in footer | `src/app/(legal)/anpc/*` + `site-footer.tsx` | ✅ (content) / ⛔ (legal review) |
| Trader identification / imprint | `src/content/legal/*/imprint.mdx` | 🟡 (placeholders → operator fills entity details) |
| Pre-contractual info + total price incl. VAT | `/pricing` VAT disclosure block (§6.4.1) | ✅ |
| Right of withdrawal info (where applicable) | terms.mdx | 🟡 |
| Terms & conditions accept at signup | partner signup flow | 🟡 |

## PSD2 / payments (Stripe)

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| SCA / 3DS handled by PSP | Stripe Checkout / Payment Element (`payment_action_required` webhook handled) | 🟡 (needs live Stripe) |
| No raw card data stored | Stripe-tokenised; only PM metadata persisted | ✅ |
| Webhook idempotency (no double-charge/replay) | `wasEventApplied` on every branch incl. `subscription.created` (A5) | ✅ |
| Dunning / failed-payment handling | `enforceDunningTier` + dunning gates | 🟡 (needs live Stripe) |
| Romanian VAT / Stripe Tax registration | — | ⛔ (operator — Stripe Tax RO registration) |

## DSA (Regulation (EU) 2022/2065) — reviews / UGC

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Notice-and-action for illegal content | review report → moderation (`/partner/reviews`, `review_reports`) | ✅ |
| Statement of reasons on moderation | moderation flow | 🟡 |
| Reviewer authenticity (verified-diner reviews) | reviews tied to completed reservations | ✅ |

## Accessibility — WCAG 2.2 AA

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Document language set | `<html lang>` in `app/layout.tsx` (per-locale) | 🟡 (verify per-locale routes) |
| Keyboard nav / focus order / visible focus | component-level; axe sweep `e2e/a11y.spec.ts` | 🟡 (axe pass done; `nested-interactive`/`target-size` open on RestaurantCard — see a11y-axe-report.md) |
| Colour contrast AA | design tokens; axe sweep | 🟡 (brand orange retoned `#F97316→#C2410C` + muted-grey `#A8A29E→#6E6862` → AA; residual opacity/overlay de-emphasis (dimmed table rows, card badges over photos) is a design pass — a11y-axe-report.md §known-open) |
| Reduced motion respected | global `prefers-reduced-motion` guard in `globals.css` (B3) | ✅ |
| Form labels / ARIA | component-level; axe sweep (no violations) | ✅ (on audited public surfaces) |

## ePrivacy / cookies

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Prior consent for non-essential cookies | `cookie-consent/` (banner + stored consent + expiry purge) | ✅ |
| Granular consent + withdrawal | `use-consent.ts` | ✅ |
| No advertising trackers | none in scope (see sub-processors note 4) | ✅ |

## Gaps to file as tasks

- **D3 a11y** — run axe-core across key surfaces; fix labels/contrast/focus
  (WCAG rows above marked ⬜).
- **A10** — inbound SMS STOP handler (deferred; SMS off at launch).
- **Phase B3** — `prefers-reduced-motion` guard on motion-heavy components.
- Operator (non-code): DPAs signed, Stripe Tax RO registration, imprint entity
  details, DKIM/SPF/DMARC, legal review of all `*.mdx` legal copy.
