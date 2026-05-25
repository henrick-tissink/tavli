/**
 * @jest-environment node
 */
import { parseBnrXml } from "@/lib/pricing/parse-bnr";
import { rateStaleness, makeLoadPricingPrimitives } from "@/lib/pricing/load-primitives";
import { makeRefreshBnrRate } from "@/lib/pricing/refresh-rate";

const BNR_XML = `<?xml version="1.0" encoding="utf-8"?>
<DataSet xmlns="http://www.bnr.ro/xsd">
  <Header><PublishingDate>2026-05-20</PublishingDate></Header>
  <Body>
    <Subject>Reference rates</Subject>
    <OrigCurrency>RON</OrigCurrency>
    <Cube date="2026-05-20">
      <Rate currency="USD">4.4012</Rate>
      <Rate currency="EUR">4.9725</Rate>
      <Rate currency="HUF" multiplier="100">1.2345</Rate>
    </Cube>
  </Body>
</DataSet>`;

describe("parseBnrXml", () => {
  test("extracts the EUR rate + effective date", () => {
    expect(parseBnrXml(BNR_XML)).toEqual({ rate: 4.9725, effectiveDate: "2026-05-20" });
  });
  test("throws on missing EUR", () => {
    expect(() => parseBnrXml(`<DataSet><Body><Cube date="2026-05-20"><Rate currency="USD">4.4</Rate></Cube></Body></DataSet>`)).toThrow(/TV1302/);
  });
});

describe("rateStaleness", () => {
  test("tiers by age", () => {
    expect(rateStaleness("2026-05-20", "2026-05-20")).toBe("fresh");
    expect(rateStaleness("2026-05-19", "2026-05-20")).toBe("stale_1d");
    expect(rateStaleness("2026-05-10", "2026-05-20")).toBe("stale_warn");
    expect(rateStaleness("2026-04-20", "2026-05-20")).toBe("stale_critical");
  });
});

describe("loadPricingPrimitives", () => {
  test("returns tiers + the RON rate with staleness", async () => {
    const db = { execute: jest.fn(async () => [{ source: "bnr_eur_ron", effective_date: "2026-05-20", rate: 4.9725 }]) };
    const p = await makeLoadPricingPrimitives({ db: db as never, now: () => new Date("2026-05-21T10:00:00Z") })();
    expect(p.tiers).toHaveLength(2);
    expect(p.ronRate).toMatchObject({ rate: 4.9725, source: "bnr_eur_ron", staleness: "stale_1d" });
  });
  test("null rate when none stored", async () => {
    const db = { execute: jest.fn(async () => []) };
    const p = await makeLoadPricingPrimitives({ db: db as never })();
    expect(p.ronRate).toBeNull();
  });
});

describe("makeRefreshBnrRate", () => {
  test("fetches, upserts, revalidates the 3 locale paths", async () => {
    const db = { execute: jest.fn(async () => []) };
    const revalidate = jest.fn();
    await makeRefreshBnrRate({ db: db as never, fetchXml: async () => BNR_XML, revalidate })();
    // 1 upsert + 1 staleness read
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(revalidate).toHaveBeenCalledTimes(3);
  });

  test("audits rate_stale_critical when the newest rate is >14 days old, even if the fetch fails (MED-2 §5.1)", async () => {
    const recordAudit = jest.fn(async () => {});
    const db = {
      execute: jest.fn(async (q: unknown) => {
        if (JSON.stringify(q).includes("SELECT effective_date")) return [{ effective_date: "2026-04-20" }];
        return [];
      }),
    };
    const refresh = makeRefreshBnrRate({
      db: db as never,
      fetchXml: async () => {
        throw new Error("BNR down");
      },
      revalidate: jest.fn(),
      recordAudit: recordAudit as never,
      now: () => new Date("2026-05-25T10:00:00Z"),
    });
    // the fetch failure still surfaces (job retries) …
    await expect(refresh()).rejects.toThrow("BNR down");
    // … but the critical-staleness audit fired regardless.
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "pricing.rate_stale_critical" }),
    );
  });

  test("does NOT audit critical staleness when the rate is fresh", async () => {
    const recordAudit = jest.fn(async () => {});
    const db = {
      execute: jest.fn(async (q: unknown) =>
        JSON.stringify(q).includes("SELECT effective_date") ? [{ effective_date: "2026-05-20" }] : [],
      ),
    };
    await makeRefreshBnrRate({
      db: db as never,
      fetchXml: async () => BNR_XML,
      revalidate: jest.fn(),
      recordAudit: recordAudit as never,
      now: () => new Date("2026-05-21T10:00:00Z"),
    })();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
