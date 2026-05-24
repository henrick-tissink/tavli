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
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(revalidate).toHaveBeenCalledTimes(3);
  });
});
