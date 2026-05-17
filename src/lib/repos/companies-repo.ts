import { dbAdmin } from "@/lib/db/admin";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { normalizeCui } from "@/lib/integrations/anaf";

export type CompanyRow = typeof companies.$inferSelect;

export async function findCompanyByCui(cui: string): Promise<CompanyRow | null> {
  const normalized = normalizeCui(cui);
  const rows = await dbAdmin.select().from(companies).where(eq(companies.cui, normalized)).limit(1);
  return rows[0] ?? null;
}

export async function insertPendingCompany(input: {
  cui: string;
  name: string;
  legalName?: string | null;
  billingAddress?: string | null;
  billingCity?: string | null;
  vatPayer?: boolean;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
}): Promise<CompanyRow> {
  const cui = normalizeCui(input.cui);
  const existing = await findCompanyByCui(cui);
  if (existing) return existing;

  const [row] = await dbAdmin.insert(companies).values({
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
