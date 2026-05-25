# Tavli — Sub-processor register

> **Status: DRAFT for review.** This register lists every third party that
> processes personal data on Tavli's behalf (GDPR Art. 28 sub-processors). The
> **DPA status** column is the operator's to complete — a signed Data Processing
> Agreement (or equivalent SCCs for non-EU transfers) must be in place with each
> before launch. Drafted 2026-05-25; keep in sync with `src/content/legal/*/data-processing.mdx`.

## How to use this document

- When adding a new third party that touches personal data, add a row here in
  the same PR, and update the public processing notice (`data-processing.mdx`).
- "Data categories" lists the personal data the processor can access — keep it
  minimal and accurate; it feeds the public notice and DSR scoping.
- The operator signs the actual DPAs and confirms transfer mechanisms; engineering
  keeps the register factually correct against the code.

## Active sub-processors

| Processor | Purpose | Data categories | Location / region | Transfer basis | DPA status |
|-----------|---------|-----------------|-------------------|----------------|------------|
| **Supabase** (database, auth, object storage) | Primary datastore for all application data; partner authentication; private export/photo buckets | Diner contact (name, phone, email), reservations, partner accounts, marketing data, analytics exports, uploaded photos | EU (project region — confirm `eu-central`) | EU region → no transfer; confirm DPA | ⛔ PENDING SIGNATURE |
| **Stripe** (payments & billing) | Partner subscription billing, invoices, payment methods, tax | Partner/organization billing contact, payment-method metadata, invoice amounts; **no diner data** | EU + US (Stripe is a global processor) | Stripe DPA + SCCs (Stripe-provided) | ⛔ PENDING SIGNATURE |
| **Resend** (transactional & marketing email) | Reservation/transactional emails; marketing campaign email sends | Recipient email, name, message content | US | SCCs (Resend DPA) | ⛔ PENDING SIGNATURE |
| **Twilio** (SMS / WhatsApp) | Transactional + marketing SMS and WhatsApp (WhatsApp gated by Meta verification) | Recipient phone (E.164), message content | US + global carriers | Twilio DPA + SCCs | ⛔ PENDING SIGNATURE — *SMS/WhatsApp disabled at launch (no live keys); activate the DPA before enabling* |
| **Sentry** (`@sentry/nextjs`, error monitoring) | Application error + performance monitoring | Incidental — scrub PII from event payloads; request metadata, stack traces | EU region available (confirm `de` region) | Sentry DPA (+ SCCs if US region) | ⛔ PENDING SIGNATURE |
| **Hetzner** (infrastructure host, via Coolify) | Compute + container hosting for the app and worker | All application data at rest/in transit on the host | EU (Germany) | EU — no transfer; Hetzner DPA | ⛔ PENDING SIGNATURE |

## Notes & open items for the operator

1. **Confirm regions.** Supabase and Sentry can both be EU-hosted; verify the
   actual project region and pin it. US-hosted processors (Stripe, Resend,
   Twilio) require SCCs as the Art. 46 transfer mechanism.
2. **Twilio is dormant at launch.** SMS/WhatsApp ship without live keys (the
   senders fall back to console logging). The DPA must be signed before any
   live SMS/WhatsApp send is enabled.
3. **Telemetry.** `@vercel/otel` emits traces; if exported to a hosted backend
   (e.g. a managed OTLP collector), add that backend as a row before enabling.
4. **No advertising/analytics trackers** are in scope — there is no Google
   Analytics, Meta Pixel, or similar. Cookie consent covers only first-party
   functional + the processors above.
5. Keep this table aligned with the DSR cascade: every processor that stores
   diner PII must have a corresponding erasure path (see
   `src/lib/compliance/pii-table-registry.ts` for internal tables; external
   processors are erased via their own deletion APIs / DPA terms).
