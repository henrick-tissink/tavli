import { dbAdmin } from "@/lib/db/admin";
import { corporateClients, reservations } from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { canonicalCui } from "@/lib/integrations/anaf";

export type CorporateClientRow = typeof corporateClients.$inferSelect;

export async function findCorporateClientByCui(cui: string): Promise<CorporateClientRow | null> {
  const normalized = canonicalCui(cui);
  const rows = await dbAdmin.select().from(corporateClients).where(eq(corporateClients.cui, normalized)).limit(1);
  return rows[0] ?? null;
}

export async function insertPendingCorporateClient(input: {
  cui: string;
  name: string;
  legalName?: string | null;
  billingAddress?: string | null;
  billingCity?: string | null;
  vatPayer?: boolean;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
}): Promise<CorporateClientRow> {
  const cui = canonicalCui(input.cui);
  const existing = await findCorporateClientByCui(cui);
  if (existing) return existing;

  const [row] = await dbAdmin.insert(corporateClients).values({
    cui,
    name: input.name,
    legalName: input.legalName ?? null,
    billingAddress: input.billingAddress ?? null,
    billingCity: input.billingCity ?? null,
    vatPayer: input.vatPayer ?? false,
    primaryContactEmail: input.primaryContactEmail ?? null,
    primaryContactPhone: input.primaryContactPhone ?? null,
  }).returning();
  return row;
}

export interface CorporateClientRollup {
  id: string;
  name: string;
  cui: string;
  status: CorporateClientRow["status"];
  reservationCount: number;
}

/**
 * Resolve company names by id via service-role. `corporate_clients` RLS only
 * grants reads to company *members*, so the partner reservations list (which
 * legitimately shows these companies' reservations) must resolve names this
 * way — the RLS-bound client returns nothing for a non-member partner.
 */
export async function corporateClientNamesByIds(
  ids: string[],
): Promise<{ id: string; name: string }[]> {
  if (ids.length === 0) return [];
  return dbAdmin
    .select({ id: corporateClients.id, name: corporateClients.name })
    .from(corporateClients)
    .where(inArray(corporateClients.id, ids));
}

/** Companies appearing on a given restaurant's reservations, with counts. */
export async function listCorporateClientsForRestaurant(
  restaurantId: string,
): Promise<CorporateClientRollup[]> {
  const rows = await dbAdmin
    .select({
      id: corporateClients.id,
      name: corporateClients.name,
      cui: corporateClients.cui,
      status: corporateClients.status,
      reservationCount: sql<number>`count(${reservations.id})::int`,
    })
    .from(corporateClients)
    .innerJoin(reservations, eq(reservations.corporateClientId, corporateClients.id))
    .where(and(eq(reservations.restaurantId, restaurantId), isNotNull(reservations.corporateClientId)))
    .groupBy(corporateClients.id)
    .orderBy(corporateClients.name);
  return rows;
}
