# Tavli — Architecture Specs

> **Purpose:** the authoritative architectural source for every feature in `docs/superpowers/launch-feature-commitments.md`. One doc per domain. Each doc is a complete engineering brief — an engineer (or Claude in a future session) should be able to open it and start building.
>
> **Status:** all 16 domain docs **drafted** as of 2026-05-20. Build commences against this revision; docs upgrade from `drafted` → `locked` as each survives contact with code (see Process notes).

> 🛠 **Executing from these docs?** Start at **[`build-order.md`](./build-order.md)** — the canonical dependency-ordered sequence of work units across all 16 domains, mapped against current production state. Open the lowest unfinished wave, pick a unit, then read the architecture doc it cross-references before writing code.

## Read this first

A new engineer (or future Claude session) should onboard in this order:

1. **`build-order.md`** if you're about to write code — tells you what to build next.
2. **`00-foundations.md`** end-to-end. It defines every cross-cutting contract — `ActionResult<T>`, `can()`/`requireCan()`, `webhook_events`, the error-code / audit-action / job-key registries, the GDPR erasure pattern, observability, i18n, timezone handling, the 2026 standards baseline. Every domain doc references these by section number; reading them out of order will be confusing.
3. **`13-compliance-and-legal.md`** — skim, even if it's not your domain. Every domain touches it (audit logs, retention, GDPR cascades, DSAR exports).
4. **Your assigned domain doc** end-to-end. Search for the checkbox identifier from `launch-feature-commitments.md` to find your feature.
5. **Cross-references at the end of your domain doc** — open every linked domain at least to "Scope" + "Data model" before writing code.

## Domain index + status

| # | Domain | Doc | Status | Build estimate |
|---|---|---|---|---|
| 00 | Foundations (stack, deployment, jobs, storage, i18n, observability) | [`00-foundations.md`](./00-foundations.md) | **drafted** | ~22 working days |
| 01 | Identity & accounts | [`01-identity-and-accounts.md`](./01-identity-and-accounts.md) | **drafted** | ~13 working days |
| 02 | Bookings & reservations | [`02-bookings.md`](./02-bookings.md) | **drafted** | ~10–12 working days (widget deferred to v1.5) |
| 03 | Diner database (per-venue + cross-venue) | [`03-diner-database.md`](./03-diner-database.md) | **drafted** | ~12 working days |
| 04 | Diner communication (transactional) | [`04-diner-communication.md`](./04-diner-communication.md) | **drafted** | ~11 working days |
| 05 | Venue page | [`05-venue-page.md`](./05-venue-page.md) | **drafted** | ~17 working days |
| 06 | Reviews | [`06-reviews.md`](./06-reviews.md) | **drafted** | ~9 working days |
| 07 | Analytics & reports | [`07-analytics-and-reports.md`](./07-analytics-and-reports.md) | **drafted** | ~12 working days (Pro dashboards to W12) |
| 08 | Table management | [`08-table-management.md`](./08-table-management.md) | **drafted** | ~25 working days |
| 09 | Multi-location | [`09-multi-location.md`](./09-multi-location.md) | **drafted** | ~10 working days |
| 10 | Corporate events | [`10-corporate-events.md`](./10-corporate-events.md) | **drafted** | ~17 working days (Stripe Connect deposits deferred to v1.5) |
| 11 | Marketing suite | [`11-marketing-suite.md`](./11-marketing-suite.md) | **drafted** | ~32 working days |
| 12 | Billing & subscriptions | [`12-billing-and-subscriptions.md`](./12-billing-and-subscriptions.md) | **drafted** | ~19 working days |
| 13 | Compliance & legal ops | [`13-compliance-and-legal.md`](./13-compliance-and-legal.md) | **drafted** | ~13 working days |
| 14 | The setup (onboarding tooling) | [`14-the-setup.md`](./14-the-setup.md) | **drafted** | ~7 working days |
| 15 | Public pricing page | [`15-public-pricing-page.md`](./15-public-pricing-page.md) | **drafted** | ~12 working days |

> **Estimate history.** Per-domain estimates dropped after a 2026-05 trim exercise that deferred the bookings widget, Pro analytics dashboards, Stripe Connect deposits, video hero, and the parallel-run mirror to v1.5. Foundations *grew* during the same exercise (16 → 22 days) to add OpenTelemetry, `webhook_events`, `erasure_log`, RFC 8058, and CI. Per-doc deltas live in each domain's §9 build sequence.

## How to use these docs

1. **Looking up where a feature lives?** Find the domain that owns it, open that doc, search for the checkbox identifier from `launch-feature-commitments.md`.
2. **About to implement?** Open the domain doc. The "Data model" + "Open questions" sections are load-bearing — read those before writing code. Verify the foundations contracts your work depends on are themselves built (see `00-foundations.md` §18 build sequence).
3. **Reviewing a PR?** The domain doc is the source of truth for architectural intent. If the PR contradicts the doc, either the PR is wrong or the doc needs updating — fix one of them.
4. **Pacing the build?** The index above carries an aggregate estimate; §9 of each domain doc has the PR-sized step-by-step. Cross-reference with the scope-risk section of `launch-feature-commitments.md`.

## Per-domain doc template

Each domain doc minimally has these sections, in this order:

1. **Scope** — one paragraph: what this domain owns, what it doesn't. Lists every checkbox from `launch-feature-commitments.md` this domain covers, with `[ ]` / `[x]` mirroring the source.
2. **Current state** — what's already in the codebase, with file paths. What's missing.
3. **Data model** — tables (existing + new), key columns, foreign keys, RLS policies, migration ordering. PII-bearing tables flag `redacted_at` per foundations §15a.1.
4. **APIs / interfaces** — every server action (returning `ActionResult<T>` per foundations §3.2), API route, webhook, signed-URL pattern. Include input/output shapes and validation rules.
5. **UI surfaces** — which screens / sheets / components. Where state lives. Forms (RHF + Zod). Loading + error states. Accessibility commitments per foundations §15a.7 (WCAG 2.2 AA).
6. **Background jobs** — cron entries or pg-boss jobs (foundations §10.2). Schedule / trigger. Idempotency. Retry. DLQ. Failure mode.
7. **Tools & libraries** — concrete package choices, version pins where the API changes between majors.
8. **Compliance & audit hooks** — GDPR / ANPC touchpoints, audit log writes via `recordAudit()` (foundations §16.2), consent capture, retention rules.
9. **Build sequence** — ordered list of PR-sized work items with day estimates. First PR → last PR.
10. **Open questions** — anything genuinely undecided. Each with a recommendation.
11. **Cross-references** — links to other domains this one depends on or is depended on by.

Complex domains add subsections beyond this minimum (e.g. §00 has 19 sections; §05 has a dedicated Accessibility section; §13 has compliance subsections for NIS2 / EU AI Act / DSA; §11 has detailed channel + send-strategy subsections). The 11-section template is the floor, not the ceiling.

## 2026 standards baseline

These baselines are applied across every domain. Each is defined once in `00-foundations.md`; domain docs reference by section number. If a domain doc contradicts a foundation, the foundation wins — open a PR to fix the domain doc.

| Standard | Where defined | What it requires |
|---|---|---|
| **WCAG 2.2 AA** | §15a.7 | Target size 24px (touch 44px), focus appearance, accessible authentication, redundant entry. axe-core in CI on public surfaces. |
| **PSD2 / SCA** | §15a.2 | Stripe Checkout setup-mode for card-on-file; explicit recurring-charge consent email; MIT `off_session` for day-91 conversion; `incomplete` state recovery via 3DS link. |
| **RFC 8058 one-click unsubscribe** | §6.5 | `List-Unsubscribe` + `List-Unsubscribe-Post` headers on every marketing email; signed-token `/u/[token]` endpoint. |
| **NIS2 directive** | §15a.3 | Out-of-scope at v1 (sub-threshold); incident-response runbook + sub-processor list maintained for the eventual transition. |
| **EU AI Act** | §15a.4 | No AI features in v1; transparency notices required if AI is introduced post-launch. |
| **Digital Services Act** | §15a.5 | Notice-and-action mechanism on reviews (§06); statement of reasons on takedown; annual transparency report from month-12. |
| **GDPR erasure** | §15a.1 | Append-only `erasure_log` table + `redacted_at` markers on every PII-bearing table. **No in-place JSONB regex replacement.** Third-party residuals (Meta WhatsApp, Twilio, Resend, Stripe, Sentry) tracked with provider-specific deletion submissions. |
| **NIST 800-63B passwords** | §5.1 | 8-char minimum, no forced rotation, HIBP breach check, email-enumeration defense. |
| **MFA + passkeys** | §5.2 | TOTP in v1 (mandatory for `tavli_admin`); WebAuthn passkeys deferred to v1.5. |
| **OpenTelemetry tracing** | §12.3 | `traceparent` propagation across web ↔ pg-boss workers ↔ webhooks; Sentry as the export target. |
| **Data residency (EU)** | §15a.8 | Supabase EU region; Resend EU; Twilio EU; Sentry EU; Stripe EU entity; Coolify on Hetzner (DE). |
| **ANPC + ANSPDCP (Romanian)** | §15a.6 | T&Cs + 14-day withdrawal; cookie consent 13mo; 72h breach-notification rehearsal; e-Factura referenced for B2B billing in §12. |

## Conventions

All conventions are canonical in `00-foundations.md`. The highlights you cannot get wrong:

- **Server actions** return `ActionResult<T>` (§3.2). Validate Zod schema first, then `requireCan(session, action, subject)` (§3.4), then work. Never throw across the boundary.
- **Code layout** (§3.1): actions co-located with routes (`actions.ts` next to `page.tsx`); cross-route shared logic in `src/lib/<domain>/`; data access in `src/lib/repos/<domain>/`; React Email templates in `src/emails/`; cron handlers in `src/app/api/cron/<name>/route.ts`.
- **Database** (§4): every new table gets `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`, RLS enabled. PII-bearing tables add `redacted_at timestamptz` for the erasure pattern.
- **Error codes** live in `src/lib/errors/codes.ts` with partitioned `TV<NNN>` ranges per domain (§16.1). Claim a code in the registry before using it in a server action.
- **Audit log writes** via `recordAudit({ action: AUDIT.<domain>.<verb>, ... })` from `src/lib/audit/actions.ts` (§16.2). No free strings; the helper rejects unregistered actions at compile time.
- **Job names** from `src/lib/jobs/keys.ts` (§16.3). No free strings. pg-boss jobs registered with retry, DLQ, and traceparent propagation (§10.2).
- **Naming**: `snake_case` plural tables (`customer_consents`); `snake_case` enum values (`'opt_in_marketing'`); verb-first server actions (`createCampaign`, `scheduleCampaignSend`).
- **Testing** (§13): Jest unit + integration (no DB mocks); Playwright e2e with axe-core for a11y on public flows.

## Process notes

- These docs are working artefacts. When a domain doc's reality diverges from the codebase (because we built differently than we wrote), update the doc — don't leave it stale.
- A domain doc is **drafted** when every section is written and reviewed.
- A domain doc is **locked** when an engineer has built against it and the doc still matches reality. Most docs in the index above are currently drafted (reviewed + approved for build) — they upgrade to locked as each is built against. This distinction matters: a `drafted` doc may still surface contradictions during build; a `locked` doc has survived contact with code.
- The `Build estimate` column is honest, not optimistic. It exists to support the W8 launch sequencing decision in `launch-feature-commitments.md`.
- Adding a new domain doc: pick the next number (16+), copy the template above, link from this index, and update this README in the same PR.

## Glossary

Tavli vocabulary — these terms have specific meanings; do not use them loosely.

- **Diner** — a real human who books or eats at a restaurant. Diner identity + history lives in §03. Diners are NOT users of the partner portal; they interact via guest tokens (§02) or opt-in consumer accounts (§01).
- **Organization** — a Tavli-paying business entity. Owns one or more restaurants. Has a `tax_id` + `country_code` identifying the legal entity. Defined in §01.
- **Restaurant** / **venue** — a single restaurant location. Child of an organization. Has bookings, tables, staff, a venue page. The two terms are used interchangeably: "restaurant" is the schema name (`restaurants` table); "venue" is the user-facing word.
- **Corporate client** — a B2B booker requesting an event (e.g. "Microsoft RO" booking a 50-person dinner). **Distinct from organization** — corporate clients are diners-with-a-company-name, not Tavli operators. Defined in §10. (Previously named `companies`; renamed to `corporate_clients` per §01 open question 8.)
- **Legal entity** — the tax-bearing entity behind an organization, identified by `(country_code, tax_id)`. One legal entity may not consume more than one trial (§01 §11).
- **Staff** — humans who work at a restaurant (roles: `owner`, `manager`, `host`). Modeled in `restaurant_staff`; distinct from `organization_members` (org-level roles). Defined in §01.
- **Partner** — colloquial term for the operator-side user, typically an organization owner. The partner portal (`/partner/*`) is the partner-facing UI.
- **Drafted** vs **locked** — see Process notes above.

---

*Last updated: 2026-05-20. Update as decisions lock or as new patterns emerge from implementation.*
