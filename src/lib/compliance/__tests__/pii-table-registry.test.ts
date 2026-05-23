import { PII_TABLE_REGISTRY, type PiiTableEntry } from "../pii-table-registry";

describe("PII_TABLE_REGISTRY", () => {
  it("exports an array of registry entries", () => {
    expect(Array.isArray(PII_TABLE_REGISTRY)).toBe(true);
  });

  it("every entry has a unique tableName", () => {
    const names = PII_TABLE_REGISTRY.map((e: PiiTableEntry) => e.tableName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("shipped:true entries always have either a handler OR a coveredBy ref", () => {
    for (const entry of PII_TABLE_REGISTRY) {
      if (entry.shipped) {
        const hasHandler = entry.handler != null;
        const hasCoveredBy = entry.coveredBy != null;
        expect(hasHandler || hasCoveredBy).toBe(true);
      }
    }
  });

  it("shipped:true entries always have a verificationQuery", () => {
    for (const entry of PII_TABLE_REGISTRY) {
      if (entry.shipped) {
        expect(entry.verificationQuery).not.toBeNull();
      }
    }
  });
});
