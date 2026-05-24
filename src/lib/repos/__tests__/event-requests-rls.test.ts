/**
 * @jest-environment node
 *
 * Cross-cutting RLS integration tests for the `event_requests` table.
 * Asserts the policy visibility matrix:
 *
 *   - restaurant owner can read their own venue's event_requests
 *   - requester (auth.uid() == requested_by_user_id) can read their own row
 *   - unrelated authenticated users cannot read either above
 *   - anon callers cannot read event_requests directly, but the SECURITY
 *     DEFINER `get_event_request_by_token(p_token text)` RPC returns the
 *     row when given a valid tracking token (and nothing otherwise)
 *
 * Prereqs:
 *   - Local Supabase stack running with 0008_corporate_foundations applied.
 *   - SUPABASE_JWT_SECRET (defaults to the local stack secret).
 */

import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import {
  eventRequests,
  restaurants,
  cities,
  organizations,
  organizationMembers,
  profiles,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { createClientForUser } from "@/lib/db/test-helpers";

// Create a real auth.users entry so PostgREST recognises the user. The
// `on_auth_user_created` trigger backfills the profiles row.
async function seedAuthUser(emailHint: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const email = `${emailHint}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@rls.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: "test-pw-9f7a3c",
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return data.user.id;
}

describe("event_requests RLS", () => {
  let restaurantId = "";
  let ownerId = "";
  let strangerId = "";
  let requesterId = "";
  let trackingToken = "";
  let eventRequestId = "";

  beforeAll(async () => {
    [ownerId, strangerId, requesterId] = await Promise.all([
      seedAuthUser("owner"),
      seedAuthUser("stranger"),
      seedAuthUser("requester"),
    ]);
    await dbAdmin
      .update(profiles)
      .set({ role: "restaurant_owner" })
      .where(eq(profiles.id, ownerId));

    await dbAdmin
      .insert(cities)
      .values({ slug: "rls-city", name: "RLS", countryCode: "RO" })
      .onConflictDoNothing();
    const [c] = await dbAdmin
      .select()
      .from(cities)
      .where(eq(cities.slug, "rls-city"))
      .limit(1);
    const orgId = crypto.randomUUID();
    await dbAdmin.insert(organizations).values({
      id: orgId,
      name: "Test Org",
      primaryContactEmail: `org-${orgId}@rls.test`,
    });
    // Ownership is org-membership-based since 0015 (is_owner_of checks
    // organization_members / restaurant_staff, not profiles.role). The owner
    // must actually be an org owner for the event_requests_owner_read policy.
    await dbAdmin
      .insert(organizationMembers)
      .values({ organizationId: orgId, userId: ownerId, role: "owner" });
    const [r] = await dbAdmin
      .insert(restaurants)
      .values({
        slug: `rls-${Date.now()}`,
        name: "R",
        cityId: c.id,
        status: "live",
        eventsIntakeEnabled: true,
        organizationId: orgId,
      })
      .returning();
    restaurantId = r.id;

    const [er] = await dbAdmin
      .insert(eventRequests)
      .values({
        restaurantId,
        guestName: "X",
        guestEmail: "requester@t.co",
        occasion: "wedding",
        eventDate: "2026-08-01",
        partySize: 30,
        requestedByUserId: requesterId,
        status: "new",
        trackingToken: randomBytes(32).toString("hex"),
      })
      .returning();
    eventRequestId = er.id;
    trackingToken = er.trackingToken;
  });

  it("owner can read their venue's event_requests", async () => {
    const c = createClientForUser(ownerId);
    const { data, error } = await c
      .from("event_requests")
      .select("id")
      .eq("id", eventRequestId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("requester can read their own event_requests", async () => {
    const c = createClientForUser(requesterId);
    const { data, error } = await c
      .from("event_requests")
      .select("id")
      .eq("id", eventRequestId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("stranger cannot read others' event_requests", async () => {
    const c = createClientForUser(strangerId);
    const { data } = await c
      .from("event_requests")
      .select("id")
      .eq("id", eventRequestId);
    expect(data ?? []).toHaveLength(0);
  });

  it("anon cannot select event_requests directly", async () => {
    const c = createClientForUser(null);
    const { data } = await c
      .from("event_requests")
      .select("id")
      .eq("id", eventRequestId);
    expect(data ?? []).toHaveLength(0);
  });

  it("anon can fetch via SECURITY DEFINER RPC with a valid token", async () => {
    const c = createClientForUser(null);
    const { data, error } = await c.rpc("get_event_request_by_token", {
      p_token: trackingToken,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const rows = Array.isArray(data) ? data : [data];
    expect(rows[0]?.id).toBe(eventRequestId);
  });

  it("anon gets nothing via RPC with a bad token", async () => {
    const c = createClientForUser(null);
    const { data, error } = await c.rpc("get_event_request_by_token", {
      p_token: "no_such_token_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(error).toBeNull();
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    expect(rows).toHaveLength(0);
  });
});
