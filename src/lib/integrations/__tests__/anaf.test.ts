import { lookupCui, normalizeCui, isValidCuiFormat } from "../anaf";

describe("normalizeCui", () => {
  it("strips 'RO' prefix and whitespace, uppercases", () => {
    expect(normalizeCui(" ro12345678 ")).toBe("RO12345678");
    expect(normalizeCui("12345678")).toBe("12345678");
  });
});

describe("isValidCuiFormat", () => {
  it("accepts 2-10 digits, optionally prefixed with RO", () => {
    expect(isValidCuiFormat("RO12345678")).toBe(true);
    expect(isValidCuiFormat("12")).toBe(true);
    expect(isValidCuiFormat("12345678901")).toBe(false);
    expect(isValidCuiFormat("ABC")).toBe(false);
  });
});

describe("lookupCui", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it("returns enriched company info on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        found: [{
          date_generale: {
            cui: 12345678,
            denumire: "ACME SRL",
            adresa: "Str. Test 1, Bucharest",
            stare_inregistrare: "INREGISTRAT din data 2010-01-01",
          },
          inregistrare_scop_Tva: { scpTVA: true },
        }],
      }),
    }) as unknown as typeof fetch;

    const res = await lookupCui("RO12345678");
    expect(res.found).toBe(true);
    expect(res.name).toBe("ACME SRL");
    expect(res.vatPayer).toBe(true);
  });

  it("returns found=false when API returns empty", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ found: [], notFound: ["12345678"] }),
    }) as unknown as typeof fetch;
    const res = await lookupCui("12345678");
    expect(res.found).toBe(false);
  });

  it("returns ok=false on network error so caller can fall back", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network"));
    const res = await lookupCui("12345678");
    expect(res.ok).toBe(false);
    expect(res.found).toBe(false);
  });

  it("returns ok=false when fetch is aborted via timeout signal", async () => {
    global.fetch = jest.fn().mockImplementation(() => Promise.reject(new DOMException("aborted", "AbortError")));
    const res = await lookupCui("12345678");
    expect(res.ok).toBe(false);
    expect(res.found).toBe(false);
  });
});
