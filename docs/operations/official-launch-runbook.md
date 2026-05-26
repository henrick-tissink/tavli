# Official launch runbook — promoting `tavli.ro` to live

> **Status (2026-05-26):** NOT started. We are running the **demo** environment
> first (see "Two-environment model" below). This document is the durable
> checklist for when we start the **official launch** of the real `tavli.ro`
> site on a separate server, days later. Nothing here gates the demo.

## Two-environment model

| | **demo.tavli.ro** (now) | **tavli.ro** (official launch) |
|---|---|---|
| Server | current Hetzner+Coolify box | **new, separate server** |
| Content | fake / seeded (20 restaurants) | real |
| DB | reuses current prod DB (@0060) | **fresh DB, real data only** |
| Indexing | **noindex** (`DEMO_MODE=true`) | indexable (`DEMO_MODE` unset) |
| Stripe | **test** keys | **live** keys + Tax RO |
| Email/SMS | keyless (console-log, no sends) | real Resend + Twilio |
| Purpose | prospect demos + testing site | the product |

The bare `tavli.ro` apex stays **unpointed** until official launch — we cut DNS
over to the new server only at go-live (decision 2026-05-26). The demo is
sufficient until then.

The code is environment-agnostic: `DEMO_MODE` (noindex), `NEXT_PUBLIC_SITE_URL`
(canonicals/hreflang — pricing origin now derives from it, not hardcoded),
keyless email/SMS fallbacks, and Stripe test-vs-live are all just env. So the
*same* `main` builds both; only env + DB differ per deployment.

## Launch gate — ordered, all REQUIRED for official launch

Items 1–2 unblock the rest.

1. **Provision the new server + a FRESH database.**
   - Stand up the new Hetzner+Coolify box (see `memory/deploy_setup.md`).
   - New Supabase project (EU region). Apply **all** drizzle migrations
     `0000 → latest` in order via `psql … -f` (the chain is internally
     consistent — see build-phase memory), each in its own transaction, plus the
     `drizzle.__drizzle_migrations` bookkeeping row per `deploy_setup`.
   - **Do NOT run `npm run db:seed`** — live carries real data only.

2. **Live env profile** (web service; worker service mirrors DB + `WORKER_MODE`):
   - `DEMO_MODE` → **unset** (indexable; emits the normal robots.txt + no noindex header).
   - `NEXT_PUBLIC_SITE_URL=https://tavli.ro`, `NEXT_PUBLIC_APP_URL=https://tavli.ro`
     (⚠️ `NEXT_PUBLIC_*` are build-time — full rebuild after setting).
   - `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the new project's.
   - `LINK_TRACKING_SECRET` → a **real** secret (`openssl rand -base64 32`); fail-closed in prod.
   - `RESEND_API_KEY` → **real** (transactional + marketing email).
   - `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_SMS_FROM` / `TWILIO_WHATSAPP_FROM` → real (EU-provisioned), when SMS/WhatsApp launch.
   - `PARTNER_SIGNUP_ENABLED` → per launch strategy (`"false"` = wait-list modal; unset = open signup CTAs).
   - `SENTRY_DSN` (+ `NEXT_PUBLIC_SENTRY_DSN`, env, sample rate) → EU project.
   - `PGBOSS_DATABASE_URL` (direct `:5432`, not pooled `:6543`) + worker service with `WORKER_MODE=true`. Crons auto-register.

3. **Stripe go-live** (§12 §3.6.4):
   - `STRIPE_SECRET_KEY=sk_live_… npm run seed:stripe-prices` (creates **live** products/prices, prints `STRIPE_PRICE_*`) → set those envs → `npm run verify:stripe-prices`.
   - Create the **live** webhook → `https://tavli.ro/api/webhooks/stripe` → set `STRIPE_WEBHOOK_SECRET`.
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…`.
   - **Register Stripe Tax for Romania (RO).** Marketing overage bills via `invoiceItems.create` once the live key is present.

4. **DKIM / SPF / DMARC warmup** on the `tavli.ro` sending domain (Resend → Cloudflare DNS). Start EARLY — warmup takes days. The demo never sends from this domain (keyless), so reputation is clean.

5. **Sign DPAs** with every sub-processor — see `docs/operations/sub-processors.md`: Resend, Twilio, Stripe, Supabase, Cloudflare, Sentry.

6. **Legal sign-off.** RO/EN/DE legal pages render but the registered entity is still `<Placeholder>`/TBD across locales, and the German text is a faithful draft. Lawyer pass + fill in the real entity before go-live.

7. **DNS cutover.** Point `tavli.ro` apex at the new server; issue TLS. (Demo stays on `demo.tavli.ro`.)

## Post-cutover verification (close together at go-live)

- **Lighthouse + axe-core + cross-browser** on all public surfaces (§15a.7).
- Confirm the site is **indexable**: `robots.txt` allows `/`, no `X-Robots-Tag: noindex` header, canonicals/hreflang point to `https://tavli.ro`, sitemap present.
- **Smoke test** the standing test partner account (`memory/test_partner_account.md`) end-to-end with a **live** Stripe card flow (then refund), real transactional email delivery, booking lifecycle.
- Walk the **ANPC / GDPR / PSD2 / DSA / WCAG** checklist: `docs/operations/launch-conformance-checklist.md`.

## References
- Demo standing-up steps: this session's chat + `memory/project_demo_live_split.md`.
- Build order (authoritative): `docs/superpowers/architecture/build-order.md`.
- Deploy conventions: `memory/deploy_setup.md`.
- Sub-processors / conformance / a11y: the other files in `docs/operations/`.
