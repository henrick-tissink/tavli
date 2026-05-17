/**
 * @jest-environment node
 *
 * Cross-cutting RLS integration tests for the `event_requests` table.
 *
 * SKELETON STATUS — currently `describe.skip`. This suite verifies that
 * RLS policies on event_requests enforce the intended visibility matrix:
 *
 *   - restaurant owner can read their own venue's event_requests
 *   - requester (auth.uid() == requested_by_user_id) can read their own row
 *   - unrelated authenticated users cannot read either above
 *   - anonymous callers cannot read directly, but the SECURITY DEFINER
 *     `get_event_request_by_token(p_token text)` RPC returns the row when
 *     given a valid tracking token, and nothing otherwise
 *
 * TODO before un-skipping:
 *
 *   1. Create `src/lib/db/test-helpers.ts` exporting:
 *
 *        export function createClientForUser(userId: string | null): SupabaseClient
 *
 *      Strategy: construct a Supabase JS client with the anon key, then
 *      either (a) mint a short-lived JWT signed with the Supabase JWT
 *      secret carrying `sub = userId` and `role = "authenticated"` (or
 *      `"anon"` when `userId` is null), or (b) use the Admin API to
 *      issue/refresh a session for a real auth.users row created with
 *      `supabase.auth.admin.createUser`. Strategy (a) is faster but
 *      requires `SUPABASE_JWT_SECRET` in the env; strategy (b) is more
 *      faithful but needs cleanup hooks.
 *
 *   2. Ensure the local Supabase stack is running with the 0008
 *      migration applied (it ships the policies under test).
 *
 *   3. Ensure `profiles`, `restaurants`, `cities`, `event_requests` are
 *      writeable from `dbAdmin` in tests (CI/local). Existing repo tests
 *      already assume this.
 *
 *   4. Remove the `.skip` below and run:
 *        npx jest src/lib/repos/__tests__/event-requests-rls.test.ts --forceExit
 */

import { dbAdmin } from "@/lib/db/admin";
import { eventRequests, restaurants, cities, profiles } from "@/lib/db/schema";
// TODO: import { createClientForUser } from "@/lib/db/test-helpers";

describe.skip("event_requests RLS", () => {
  let restaurantId = "";
  let ownerId = "";
  let strangerId = "";
  let requesterId = "";
  let trackingToken = "";
  let eventRequestId = "";

  beforeAll(async () => {
    ownerId = crypto.randomUUID();
    strangerId = crypto.randomUUID();
    requesterId = crypto.randomUUID();
    await dbAdmin.insert(profiles).values([
      { id: ownerId, role: "restaurant_owner", email: "o@t.co" },
      { id: strangerId, role: "consumer", email: "s@t.co" },
      { id: requesterId, role: "consumer", email: "r@t.co" },
    ]);
    await dbAdmin
      .insert(cities)
      .values({ slug: "rls", name: "R", countryCode: "RO" })
      .onConflictDoNothing();
    const [c] = await dbAdmin.select().from(cities).limit(1);
    const [r] = await dbAdmin
      .insert(restaurants)
      .values({
        slug: `rls-${Date.now()}`,
        name: "R",
        cityId: c.id,
        status: "live",
        ownerUserId: ownerId,
        eventsIntakeEnabled: true,
      })
      .returning();
    restaurantId = r.id;
    const [er] = await dbAdmin
      .insert(eventRequests)
      .values({
        restaurantId,
        guestName: "X",
        guestEmail: "r@t.co",
        occasion: "wedding",
        eventDate: "2026-08-01",
        partySize: 30,
        trackingToken:
          "rls_token_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        requestedByUserId: requesterId,
        status: "new",
      })
      .returning();
    eventRequestId = er.id;
    trackingToken = er.trackingToken;
  });

  it.todo("owner can read their venue's event_requests");
  it.todo("requester can read their own event_requests");
  it.todo("stranger cannot read others' event_requests");
  it.todo("anon can read via SECURITY DEFINER function with valid token");
  it.todo("anon gets nothing with bad token");

  // Once `createClientForUser` exists, replace the it.todo() entries with
  // the bodies from
  // docs/superpowers/plans/2026-05-13-corporate-bookings-phase-1-private-events.md
  // Task 34, which look like:
  //
  //   it("owner can read their venue's event_requests", async () => {
  //     const c = createClientForUser(ownerId);
  //     const { data } = await c.from("event_requests").select("id").eq("id", eventRequestId);
  //     expect(data).toHaveLength(1);
  //   });
  //
  // (etc., one case per `it.todo()` above)
  void restaurantId;
  void strangerId;
  void trackingToken;
  void eventRequestId;
});
