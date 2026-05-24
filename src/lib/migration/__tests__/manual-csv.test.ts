import { parseManualCsv } from "@/lib/migration/manual-csv";
import { dedupKey, isDuplicate } from "@/lib/migration/dedup";

const HEADER = "reservation_date,reservation_time,party_size,guest_name,guest_phone,guest_email,notes,status";

describe("parseManualCsv", () => {
  test("parses valid rows", () => {
    const csv = `${HEADER}\n2026-05-01,19:00,4,Ana Pop,+40712345678,ana@x.com,window seat,completed`;
    const r = parseManualCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ reservation_date: "2026-05-01", party_size: 4, guest_name: "Ana Pop", guest_phone: "+40712345678" });
  });

  test("collects per-row validation errors (TV1202), keeps valid rows", () => {
    const csv = `${HEADER}\n2026-05-01,19:00,4,Ana,+40712345678,,,\nbad-date,19:00,2,Ben,+40700000000,,,\n2026-05-02,19:00,0,Cyn,+40711111111,,,`;
    const r = parseManualCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(r.errors.every((e) => e.code === "TV1202")).toBe(true);
  });

  test("row without guest_phone is rejected (reservations requires it)", () => {
    const csv = `${HEADER}\n2026-05-01,19:00,4,Ana,,ana@x.com,,`;
    const r = parseManualCsv(csv);
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0].message).toMatch(/missing guest_phone/);
  });
});

describe("dedup", () => {
  test("phone-present rows produce a stable key; phone-less → null", () => {
    expect(dedupKey("2026-05-01", "19:00", "+40712345678", 4)).toBe("2026-05-01|19:00|+40712345678|4");
    expect(dedupKey("2026-05-01", "19:00:00", "+40712345678", 4)).toBe("2026-05-01|19:00|+40712345678|4");
    expect(dedupKey("2026-05-01", "19:00", null, 4)).toBeNull();
  });

  test("isDuplicate: null key never matches; present key matches the set", () => {
    const set = new Set(["2026-05-01|19:00|+40712345678|4"]);
    expect(isDuplicate("2026-05-01|19:00|+40712345678|4", set)).toBe(true);
    expect(isDuplicate("2026-05-01|20:00|+40712345678|4", set)).toBe(false);
    expect(isDuplicate(null, set)).toBe(false);
  });
});
