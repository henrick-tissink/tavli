import { computeCohortRows, type DinerVisits } from "@/lib/analytics/cohort";

const diners: DinerVisits[] = [
  { cohortMonth: "2026-01-01", visitMonths: ["2026-01-01", "2026-02-01", "2026-04-01"] },
  { cohortMonth: "2026-01-01", visitMonths: ["2026-01-01", "2026-03-01"] },
  { cohortMonth: "2026-02-01", visitMonths: ["2026-02-01"] },
];

const find = (rows: ReturnType<typeof computeCohortRows>, month: string, offset: number) =>
  rows.find((r) => r.cohortMonth === month && r.monthOffset === offset);

describe("computeCohortRows", () => {
  const rows = computeCohortRows(diners, "2026-04-01");

  test("offset 0 is the full cohort (retention 1.0)", () => {
    expect(find(rows, "2026-01-01", 0)).toMatchObject({ cohortSize: 2, retainedCount: 2, retentionRate: 1 });
    expect(find(rows, "2026-02-01", 0)).toMatchObject({ cohortSize: 1, retainedCount: 1, retentionRate: 1 });
  });

  test("partial retention is counted per cohort", () => {
    expect(find(rows, "2026-01-01", 1)).toMatchObject({ retainedCount: 1, retentionRate: 0.5 }); // only d1 returned Feb
    expect(find(rows, "2026-01-01", 2)).toMatchObject({ retainedCount: 1, retentionRate: 0.5 }); // only d2 returned Mar
    expect(find(rows, "2026-01-01", 3)).toMatchObject({ retainedCount: 1, retentionRate: 0.5 }); // only d1 returned Apr
  });

  test("zero retention emits a row with rate 0", () => {
    expect(find(rows, "2026-02-01", 1)).toMatchObject({ retainedCount: 0, retentionRate: 0 });
  });

  test("does not emit offsets beyond throughMonth", () => {
    expect(find(rows, "2026-01-01", 4)).toBeUndefined(); // 2026-05 > through
    expect(find(rows, "2026-02-01", 3)).toBeUndefined();
  });

  test("respects maxOffset cap", () => {
    const long = computeCohortRows(
      [{ cohortMonth: "2020-01-01", visitMonths: ["2020-01-01"] }],
      "2030-01-01",
    );
    expect(Math.max(...long.map((r) => r.monthOffset))).toBe(24);
  });
});
