/**
 * @jest-environment node
 *
 * Erasure cascade integration test — end-to-end against a real Postgres.
 *
 * Skipped in CI by default (`TEST_DATABASE_URL` env required). Run locally:
 *
 *   TEST_DATABASE_URL=$DATABASE_URL npm test -- erasure-cascade.integration
 *
 * Seeds a diner with PII across every shipped registry table, runs the
 * orchestrator + phase 2 directly, asserts every PII column is null/redacted.
 *
 * Important: the test sets process.env.DATABASE_URL = TEST_DATABASE_URL so
 * that dbAdmin (which reads DATABASE_URL) connects to the test DB.
 *
 * The orchestrator's enqueue calls (phase-2 scheduling + purge scheduling)
 * are replaced with no-ops via makeHandleErasureExecute dependency injection
 * so pg-boss is never touched. Phase 2 is called directly after.
 */

jest.mock("server-only", () => ({}));
// @react-email/render uses an internal dynamic import jest's node env rejects.
// The orchestrator renders the confirmation email before the handler sweep;
// these assertions don't care about the HTML, only the cascade — stub it.
jest.mock("@react-email/render", () => ({
  render: jest.fn().mockResolvedValue("<rendered/>"),
}));

const SKIP = !process.env.TEST_DATABASE_URL;

// Point DATABASE_URL at the test DB before any module that reads it is required.
if (!SKIP) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

import { sql, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  diners,
  reservations,
  reviews,
  transactionalEmailLog,
  marketingConsents,
  dataSubjectRequests,
  prospectWaitlist,
  eventRequests,
  walkinQueue,
} from "@/lib/db/schema";
import {
  makeHandleErasureExecute,
  handleErasurePartnerNotificationsPhase2,
  resolveDinersProd,
} from "@/lib/jobs/handlers/compliance";
import { PII_TABLE_REGISTRY } from "@/lib/compliance/pii-table-registry";

// ─── Deterministic test UUIDs ───────────────────────────────────────────────
const CITY_ID = "00000000-aaaa-aaaa-aaaa-000000000001";
const ORG_ID = "11111111-aaaa-aaaa-aaaa-111111111111";
const RESTAURANT_ID = "22222222-aaaa-aaaa-aaaa-222222222222";
const ADMIN_USER_ID = "33333333-aaaa-aaaa-aaaa-333333333333";
const DINER_ID = "44444444-aaaa-aaaa-aaaa-444444444444";
const DSR_ID = "55555555-aaaa-aaaa-aaaa-555555555555";
const RESERVATION_ID = "66666666-aaaa-aaaa-aaaa-666666666666";
const PHONE = "+40712340000";
const EMAIL = "integration-test@example.invalid";

// Phase C — a pure non-diner data subject (prospect + event-request guest with
// NO diner row). Distinct ids/email so it never collides with the diner case.
const NONDINER_DSR_ID = "77777777-aaaa-aaaa-aaaa-777777777777";
const NONDINER_EVENT_ID = "88888888-aaaa-aaaa-aaaa-888888888888";
const NONDINER_PROSPECT_ID = "99999999-aaaa-aaaa-aaaa-999999999999";
const NONDINER_WALKIN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NONDINER_EMAIL = "nondiner-prospect@example.invalid";
const NONDINER_PHONE = "+40712349999";

// Orchestrator wired with no-op enqueue deps so pg-boss is never touched.
const handleErasureExecuteTest = makeHandleErasureExecute({
  loadDsr: async (id) => {
    const rows = await dbAdmin
      .select({
        id: dataSubjectRequests.id,
        status: dataSubjectRequests.status,
        identityVerified: dataSubjectRequests.identityVerified,
        approvedByUserId: dataSubjectRequests.approvedByUserId,
        dinerId: dataSubjectRequests.dinerId,
        identifierEmail: dataSubjectRequests.identifierEmail,
        identifierPhone: dataSubjectRequests.identifierPhone,
      })
      .from(dataSubjectRequests)
      .where(eq(dataSubjectRequests.id, id))
      .limit(1);
    return rows[0] ?? null;
  },
  // Use the REAL resolver (the prior inline copy used a dynamic import that
  // jest's node env rejects, and we want to exercise the actual Phase C logic).
  resolveDiners: resolveDinersProd,
  registry: PII_TABLE_REGISTRY,
  updateDsrCompleted: async (id) => {
    await dbAdmin
      .update(dataSubjectRequests)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(dataSubjectRequests.id, id));
  },
  enqueuePhase2: async () => {
    // no-op — phase 2 called directly in the test
  },
  recordAudit: async () => {
    // no-op — avoid recordAudit's server-only / dbAdmin side-effects in test
  },
  sendEmail: async () => {
    // no-op — avoid real email sends
  },
  resolveDinerLocale: async () => "ro",
});

// ─── Seed + cleanup helpers ─────────────────────────────────────────────────

async function cleanup() {
  // Best-effort cleanup in reverse-dependency order; rely on FK cascades where possible.
  await dbAdmin.execute(sql`DELETE FROM erasure_log WHERE subject_id IN (${DINER_ID}::uuid, ${RESERVATION_ID}::uuid)`);
  await dbAdmin.execute(sql`DELETE FROM erasure_log WHERE context->>'dsrId' = ${DSR_ID}`);
  await dbAdmin.execute(sql`DELETE FROM audit_logs WHERE subject_id IN (${DINER_ID}::uuid, ${RESERVATION_ID}::uuid, ${DSR_ID}::uuid)`);
  await dbAdmin.execute(sql`DELETE FROM partner_notifications WHERE pending_erasure_request_id = ${DSR_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM partner_notifications WHERE restaurant_id = ${RESTAURANT_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM marketing_suppressions WHERE reason = ${"dsr:" + DSR_ID}`);
  await dbAdmin.execute(sql`DELETE FROM data_subject_requests WHERE id IN (${DSR_ID}::uuid, ${NONDINER_DSR_ID}::uuid)`);
  // Phase C non-diner fixtures (matched by email, no diner FK).
  await dbAdmin.execute(sql`DELETE FROM marketing_suppressions WHERE reason = ${"dsr:" + NONDINER_DSR_ID}`);
  await dbAdmin.execute(sql`DELETE FROM event_requests WHERE id = ${NONDINER_EVENT_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM walkin_queue WHERE id = ${NONDINER_WALKIN_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM prospect_waitlist WHERE id = ${NONDINER_PROSPECT_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM transactional_email_log WHERE diner_id = ${DINER_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM marketing_consents WHERE diner_id = ${DINER_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM reviews WHERE reservation_id = ${RESERVATION_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM reservations WHERE id = ${RESERVATION_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM restaurant_availability WHERE restaurant_id = ${RESTAURANT_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM diners WHERE id = ${DINER_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM restaurants WHERE id = ${RESTAURANT_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM organizations WHERE id = ${ORG_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM profiles WHERE id = ${ADMIN_USER_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM auth.users WHERE id = ${ADMIN_USER_ID}::uuid`);
  await dbAdmin.execute(sql`DELETE FROM cities WHERE id = ${CITY_ID}::uuid`);
}

// ─── Test suite ─────────────────────────────────────────────────────────────

(SKIP ? describe.skip : describe)("erasure cascade end-to-end (integration)", () => {
  beforeAll(async () => {
    await cleanup();

    // City (required FK from restaurants)
    await dbAdmin.execute(sql`
      INSERT INTO cities (id, slug, name, country_code)
      VALUES (${CITY_ID}::uuid, 'integration-test-city', 'Integration City', 'RO')
      ON CONFLICT (id) DO NOTHING
    `);

    // auth.users (Supabase-managed; ON CONFLICT handles re-runs)
    await dbAdmin.execute(sql`
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password)
      VALUES (
        ${ADMIN_USER_ID}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated',
        'authenticated',
        'admin-integration@example.invalid',
        'x'
      )
      ON CONFLICT (id) DO NOTHING
    `);

    await dbAdmin.execute(sql`
      INSERT INTO profiles (id, role)
      VALUES (${ADMIN_USER_ID}::uuid, 'admin')
      ON CONFLICT (id) DO NOTHING
    `);

    // Organization (required FK from restaurants + diners)
    await dbAdmin.execute(sql`
      INSERT INTO organizations (id, name, primary_contact_email)
      VALUES (${ORG_ID}::uuid, 'Integration Test Org', 'org@example.invalid')
      ON CONFLICT (id) DO NOTHING
    `);

    // Restaurant (required FK from reservations + reviews + transactional_email_log + partner_notifications)
    await dbAdmin.execute(sql`
      INSERT INTO restaurants (id, organization_id, name, slug, city_id)
      VALUES (
        ${RESTAURANT_ID}::uuid,
        ${ORG_ID}::uuid,
        'Integration Test Restaurant',
        'integration-test-cascade',
        ${CITY_ID}::uuid
      )
      ON CONFLICT (id) DO NOTHING
    `);

    // Availability for every weekday covering 00:00–23:59 with ample capacity,
    // so the reservations_check_capacity trigger (0049) accepts the seeded
    // reservation regardless of which day-of-week the suite runs on.
    await dbAdmin.execute(sql`
      INSERT INTO restaurant_availability (restaurant_id, day_of_week, slot_start, slot_end, capacity)
      SELECT ${RESTAURANT_ID}::uuid, d, '00:00:00', '23:59:00', 1000
      FROM generate_series(0, 6) AS d
    `);

    // Diner with PII (phone + email)
    await dbAdmin.execute(sql`
      INSERT INTO diners (id, organization_id, phone, email, full_name)
      VALUES (${DINER_ID}::uuid, ${ORG_ID}::uuid, ${PHONE}, ${EMAIL}, 'Alice Integration')
    `);

    // Reservation
    await dbAdmin.execute(sql`
      INSERT INTO reservations (
        id, restaurant_id, diner_id,
        guest_name, guest_phone, guest_email,
        party_size, reservation_date, reservation_time, confirmation_token
      )
      VALUES (
        ${RESERVATION_ID}::uuid,
        ${RESTAURANT_ID}::uuid,
        ${DINER_ID}::uuid,
        'Alice Integration',
        ${PHONE},
        ${EMAIL},
        2,
        current_date,
        '19:00:00',
        'integration-cascade-token'
      )
    `);

    // Review (unique FK on reservation_id)
    await dbAdmin.execute(sql`
      INSERT INTO reviews (
        reservation_id, restaurant_id, diner_id,
        rating, comment, first_name, party_size, reservation_date
      )
      VALUES (
        ${RESERVATION_ID}::uuid,
        ${RESTAURANT_ID}::uuid,
        ${DINER_ID}::uuid,
        5,
        'Great experience',
        'Alice',
        2,
        current_date
      )
    `);

    // Transactional email log (channel='email' requires email_status, no sms_status)
    await dbAdmin.execute(sql`
      INSERT INTO transactional_email_log (
        template_key, email, phone, diner_id, reservation_id,
        organization_id, organization_id_at_event, restaurant_id,
        channel, locale, subject, email_status
      )
      VALUES (
        'reservation_confirmation',
        ${EMAIL},
        ${PHONE},
        ${DINER_ID}::uuid,
        ${RESERVATION_ID}::uuid,
        ${ORG_ID}::uuid,
        ${ORG_ID}::uuid,
        ${RESTAURANT_ID}::uuid,
        'email',
        'ro',
        'Confirmation',
        'sent'
      )
    `);

    // Marketing consent — channel must satisfy the CHECK constraint:
    // ('email_marketing','sms_marketing','sms_transactional','email_transactional')
    await dbAdmin.execute(sql`
      INSERT INTO marketing_consents (diner_id, organization_id, channel, consent_given, source)
      VALUES (
        ${DINER_ID}::uuid,
        ${ORG_ID}::uuid,
        'email_marketing',
        true,
        'web_signup'
      )
    `);

    // Partner notification referencing the reservation via payload.reservation_id
    await dbAdmin.execute(sql`
      INSERT INTO partner_notifications (restaurant_id, kind, payload)
      VALUES (
        ${RESTAURANT_ID}::uuid,
        'reservation_created',
        jsonb_build_object('reservation_id', ${RESERVATION_ID}::text)
      )
    `);

    // Audit log with subject_type='diner' (for audit-logs handler assertion)
    await dbAdmin.execute(sql`
      INSERT INTO audit_logs (
        action, subject_type, subject_id,
        actor_user_id, actor_role, organization_id, context
      )
      VALUES (
        'diner.created',
        'diner',
        ${DINER_ID}::uuid,
        ${ADMIN_USER_ID}::uuid,
        'tavli_admin',
        ${ORG_ID}::uuid,
        jsonb_build_object('name', 'Alice Integration')
      )
    `);

    // DSR in_progress, identity verified + approved — ready for cascade
    await dbAdmin.execute(sql`
      INSERT INTO data_subject_requests (
        id,
        identifier_phone, identifier_email,
        request_kind, request_source,
        legal_deadline_at,
        identity_verified, identity_verification_method, identity_verified_by_user_id,
        status, approved_by_user_id, approved_at
      )
      VALUES (
        ${DSR_ID}::uuid,
        ${PHONE},
        ${EMAIL},
        'erasure',
        'email',
        now() + interval '30 days',
        true,
        'tavli_admin_manual',
        ${ADMIN_USER_ID}::uuid,
        'in_progress',
        ${ADMIN_USER_ID}::uuid,
        now()
      )
    `);

    // ── Phase C non-diner fixtures ───────────────────────────────────────────
    // A prospect + event-request guest with NO diner row, matched by email only.
    await dbAdmin.execute(sql`
      INSERT INTO prospect_waitlist (id, email, source_locale, source_ip, notes)
      VALUES (${NONDINER_PROSPECT_ID}::uuid, ${NONDINER_EMAIL}, 'ro', '203.0.113.7', 'wants a demo')
    `);
    await dbAdmin.execute(sql`
      INSERT INTO event_requests (
        id, restaurant_id, guest_name, guest_email, guest_phone,
        occasion, event_date, party_size, tracking_token, dietary_notes
      )
      VALUES (
        ${NONDINER_EVENT_ID}::uuid, ${RESTAURANT_ID}::uuid,
        'Bob Prospect', ${NONDINER_EMAIL}, ${NONDINER_PHONE},
        'corporate_dinner', current_date + 30, 12, 'nondiner-event-token', 'two vegan'
      )
    `);
    await dbAdmin.execute(sql`
      INSERT INTO walkin_queue (id, restaurant_id, guest_name, guest_phone, party_size, status, position, notes)
      VALUES (${NONDINER_WALKIN_ID}::uuid, ${RESTAURANT_ID}::uuid, 'Bob Walkin', ${NONDINER_PHONE}, 3, 'left', 1, 'window seat pls')
    `);
    await dbAdmin.execute(sql`
      INSERT INTO data_subject_requests (
        id, identifier_phone, identifier_email,
        request_kind, request_source, legal_deadline_at,
        identity_verified, identity_verification_method, identity_verified_by_user_id,
        status, approved_by_user_id, approved_at
      )
      VALUES (
        ${NONDINER_DSR_ID}::uuid, ${NONDINER_PHONE}, ${NONDINER_EMAIL},
        'erasure', 'email', now() + interval '30 days',
        true, 'tavli_admin_manual', ${ADMIN_USER_ID}::uuid,
        'in_progress', ${ADMIN_USER_ID}::uuid, now()
      )
    `);
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  }, 30_000);

  it("runs the full cascade end-to-end + redacts every PII column", async () => {
    // Phase 1: orchestrator (diners + marketing_consents + marketing_suppressions
    //           + partner_notifications phase-1 mark + audit_logs)
    await handleErasureExecuteTest({ requestId: DSR_ID });

    // Phase 2: partner_notifications payload replacement (called directly, no pg-boss)
    await handleErasurePartnerNotificationsPhase2({ requestId: DSR_ID });

    // ── diners ──────────────────────────────────────────────────────────────
    const [d] = await dbAdmin.select().from(diners).where(eq(diners.id, DINER_ID));
    expect(d.phone).toBeNull();
    expect(d.email).toBeNull();
    expect(d.fullName).toBeNull();
    expect(d.redactedAt).not.toBeNull();

    // ── reservations ────────────────────────────────────────────────────────
    const reservationRows = await dbAdmin
      .select()
      .from(reservations)
      .where(eq(reservations.id, RESERVATION_ID));
    expect(reservationRows.length).toBe(1);
    const res = reservationRows[0];
    expect(res.guestName).toBe("Redacted");
    expect(res.guestPhone).toBe("REDACTED");
    expect(res.guestEmail).toBeNull();
    expect(res.redactedAt).not.toBeNull();

    // ── reviews ─────────────────────────────────────────────────────────────
    const reviewRows = await dbAdmin
      .select()
      .from(reviews)
      .where(eq(reviews.dinerId, DINER_ID));
    expect(reviewRows.length).toBeGreaterThan(0);
    for (const r of reviewRows) {
      expect(r.firstName).toBe("Redacted");
      expect(r.redactedAt).not.toBeNull();
    }

    // ── transactional_email_log ──────────────────────────────────────────────
    const telRows = await dbAdmin
      .select()
      .from(transactionalEmailLog)
      .where(eq(transactionalEmailLog.dinerId, DINER_ID));
    expect(telRows.length).toBeGreaterThan(0);
    for (const r of telRows) {
      expect(r.email).toBeNull();
      expect(r.phone).toBeNull();
      expect(r.redactedAt).not.toBeNull();
    }

    // ── marketing_consents — revokedAt set ──────────────────────────────────
    const mcRows = await dbAdmin
      .select()
      .from(marketingConsents)
      .where(eq(marketingConsents.dinerId, DINER_ID));
    expect(mcRows.length).toBeGreaterThan(0);
    for (const r of mcRows) {
      expect(r.revokedAt).not.toBeNull();
    }

    // ── marketing_suppressions — rows for both phone + email ─────────────────
    const supResult = await dbAdmin.execute(sql`
      SELECT channel FROM marketing_suppressions WHERE reason = ${"dsr:" + DSR_ID}
    `);
    const supRows = supResult as unknown as Array<{ channel: string }>;
    expect(supRows.map((r) => r.channel).sort()).toEqual(["email", "sms"]);

    // ── partner_notifications — phase 2 ran; payload replaced ────────────────
    // Phase-1 marks the row with pending_erasure_request_id = DSR_ID.
    // Phase-2 payload-replaces (since created_at is recent, not > 30d old).
    const pnResult = await dbAdmin.execute(sql`
      SELECT id, redacted_at, payload->>'erased' AS erased
        FROM partner_notifications
       WHERE pending_erasure_request_id = ${DSR_ID}::uuid
    `);
    const pnRows = pnResult as unknown as Array<{
      id: string;
      redacted_at: Date | null;
      erased: string | null;
    }>;
    expect(pnRows.length).toBeGreaterThan(0);
    for (const r of pnRows) {
      expect(r.redacted_at).not.toBeNull();
      expect(r.erased).toBe("true");
    }

    // ── audit_logs — diner-subject row is redacted by handleAuditLogs ────────
    const auditResult = await dbAdmin.execute(sql`
      SELECT redacted_at, context->>'erased' AS erased
        FROM audit_logs
       WHERE subject_type = 'diner' AND subject_id = ${DINER_ID}::uuid
    `);
    const auditRows = auditResult as unknown as Array<{
      redacted_at: Date | null;
      erased: string | null;
    }>;
    expect(auditRows.length).toBeGreaterThan(0);
    for (const r of auditRows) {
      expect(r.redacted_at).not.toBeNull();
      expect(r.erased).toBe("true");
    }

    // ── erasure_log entries exist (written by pseudonymiseDiner + phase2) ────
    const elResult = await dbAdmin.execute(sql`
      SELECT COUNT(*)::int AS n
        FROM erasure_log
       WHERE subject_id = ${DINER_ID}::uuid
    `);
    const elRows = elResult as unknown as Array<{ n: number }>;
    expect(elRows[0].n).toBeGreaterThan(0);

    // ── DSR marked completed ──────────────────────────────────────────────────
    const [finalDsr] = await dbAdmin
      .select()
      .from(dataSubjectRequests)
      .where(eq(dataSubjectRequests.id, DSR_ID));
    expect(finalDsr.status).toBe("completed");
    expect(finalDsr.completedAt).not.toBeNull();
  }, 60_000);

  // Phase C — a data subject with NO diner row (pure prospect + event-request
  // guest). Their PII was previously unreachable; the resolver now appends the
  // DSR's own identifier so the identifier-keyed handlers erase these rows.
  it("erases a non-diner subject (prospect_waitlist + event_requests) via identifier", async () => {
    await handleErasureExecuteTest({ requestId: NONDINER_DSR_ID });

    // prospect_waitlist redacted (email → sentinel, source_ip/notes nulled).
    const [p] = await dbAdmin
      .select()
      .from(prospectWaitlist)
      .where(eq(prospectWaitlist.id, NONDINER_PROSPECT_ID));
    expect(p.email).toBe("redacted@redacted.invalid");
    expect(p.sourceIp).toBeNull();
    expect(p.notes).toBeNull();
    expect(p.redactedAt).not.toBeNull();

    // event_requests redacted (name/email → sentinels, phone/dietary nulled).
    const [er] = await dbAdmin
      .select()
      .from(eventRequests)
      .where(eq(eventRequests.id, NONDINER_EVENT_ID));
    expect(er.guestName).toBe("Redacted");
    expect(er.guestEmail).toBe("redacted@redacted.invalid");
    expect(er.guestPhone).toBeNull();
    expect(er.dietaryNotes).toBeNull();
    expect(er.redactedAt).not.toBeNull();

    // walkin_queue redacted (matched by guest_phone → name sentinel, phone/notes nulled).
    const [w] = await dbAdmin
      .select()
      .from(walkinQueue)
      .where(eq(walkinQueue.id, NONDINER_WALKIN_ID));
    expect(w.guestName).toBe("Redacted");
    expect(w.guestPhone).toBeNull();
    expect(w.notes).toBeNull();
    expect(w.redactedAt).not.toBeNull();

    // marketing_suppressions written for the subject's email + phone.
    const supResult = await dbAdmin.execute(sql`
      SELECT channel FROM marketing_suppressions WHERE reason = ${"dsr:" + NONDINER_DSR_ID}
    `);
    const supRows = supResult as unknown as Array<{ channel: string }>;
    expect(supRows.map((r) => r.channel).sort()).toEqual(["email", "sms"]);

    // DSR completed even though no diner row matched.
    const [finalDsr] = await dbAdmin
      .select()
      .from(dataSubjectRequests)
      .where(eq(dataSubjectRequests.id, NONDINER_DSR_ID));
    expect(finalDsr.status).toBe("completed");
  }, 60_000);
});
