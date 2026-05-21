import { dbAdmin } from "@/lib/db/admin";
import { corporateClients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { normalizeCui } from "@/lib/integrations/anaf";

export type CorporateClientRow = typeof corporateClients.$inferSelect;

export async function findCorporateClientByCui(cui: string): Promise<CorporateClientRow | null> {
  const normalized = normalizeCui(cui);
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
  const cui = normalizeCui(input.cui);
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
