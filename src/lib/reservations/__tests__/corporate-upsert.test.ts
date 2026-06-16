import { buildCorporateUpsert } from "../corporate-upsert";
import type { CuiLookupResult } from "@/lib/integrations/anaf";

const cui = "RO12345678";

describe("buildCorporateUpsert", () => {
  it("uses ANAF data when the lookup found the company", () => {
    const anaf: CuiLookupResult = {
      ok: true, found: true, cui, name: "ANAF NAME SRL",
      legalName: "ANAF NAME SRL", address: "Str. X 1, Bucuresti", vatPayer: true,
    };
    expect(buildCorporateUpsert(cui, anaf, "Typed Name")).toEqual({
      cui, name: "ANAF NAME SRL", legalName: "ANAF NAME SRL",
      billingAddress: "Str. X 1, Bucuresti", vatPayer: true,
    });
  });

  it("falls back to the client name when ANAF is down (ok:false)", () => {
    const anaf: CuiLookupResult = { ok: false, found: false, cui };
    expect(buildCorporateUpsert(cui, anaf, "Typed Name")).toEqual({ cui, name: "Typed Name" });
  });

  it("falls back to the client name when ANAF returns not-found", () => {
    const anaf: CuiLookupResult = { ok: true, found: false, cui };
    expect(buildCorporateUpsert(cui, anaf, "Typed Name")).toEqual({ cui, name: "Typed Name" });
  });

  it("uses the client name when ANAF found the company but returned no name", () => {
    const anaf: CuiLookupResult = { ok: true, found: true, cui, address: "Str. Y 2" };
    expect(buildCorporateUpsert(cui, anaf, "Typed Name")).toEqual({
      cui, name: "Typed Name", legalName: undefined, billingAddress: "Str. Y 2", vatPayer: undefined,
    });
  });
});
