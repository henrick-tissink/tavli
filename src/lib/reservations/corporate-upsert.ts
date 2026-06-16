import type { CuiLookupResult } from "@/lib/integrations/anaf";

export interface CorporateUpsertInput {
  cui: string;
  name: string;
  legalName?: string;
  billingAddress?: string;
  vatPayer?: boolean;
}

/**
 * Best-effort enrichment: when ANAF resolved the company, prefer its canonical
 * name + legal name / address / VAT status; otherwise fall back to the
 * client-supplied name. The company is always upserted at pending_verification
 * (the repo sets the status); ANAF availability never blocks the booking.
 */
export function buildCorporateUpsert(
  cui: string,
  anaf: CuiLookupResult,
  clientName: string,
): CorporateUpsertInput {
  if (anaf.found) {
    return {
      cui,
      name: anaf.name ?? clientName,
      legalName: anaf.legalName,
      billingAddress: anaf.address,
      vatPayer: anaf.vatPayer,
    };
  }
  return { cui, name: clientName };
}
