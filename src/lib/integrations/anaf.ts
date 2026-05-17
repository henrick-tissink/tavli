const ANAF_BASE = process.env.ANAF_API_BASE ?? "https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva";

export interface CuiLookupResult {
  ok: boolean;
  found: boolean;
  cui: string;
  name?: string;
  legalName?: string;
  address?: string;
  city?: string;
  vatPayer?: boolean;
}

export function normalizeCui(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidCuiFormat(input: string): boolean {
  const normalized = normalizeCui(input);
  return /^(RO)?\d{2,10}$/.test(normalized);
}

function digitsOnly(input: string): string {
  return normalizeCui(input).replace(/^RO/, "");
}

export async function lookupCui(input: string): Promise<CuiLookupResult> {
  const cui = normalizeCui(input);
  if (!isValidCuiFormat(cui)) {
    return { ok: true, found: false, cui };
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(ANAF_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ cui: Number(digitsOnly(cui)), data: today }]),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, found: false, cui };
    const data = await res.json() as { found?: Array<{ date_generale?: { cui: number; denumire?: string; adresa?: string }; inregistrare_scop_Tva?: { scpTVA?: boolean } }> };
    const hit = data.found?.[0];
    if (!hit?.date_generale) return { ok: true, found: false, cui };
    return {
      ok: true,
      found: true,
      cui,
      name: hit.date_generale.denumire,
      legalName: hit.date_generale.denumire,
      address: hit.date_generale.adresa,
      vatPayer: !!hit.inregistrare_scop_Tva?.scpTVA,
    };
  } catch {
    return { ok: false, found: false, cui };
  }
}
