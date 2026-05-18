import { isoDate, localDateFromIso, addDays } from "../helpers";

test("isoDate round-trips through localDateFromIso", () => {
  const d = new Date(2026, 4, 18);
  expect(isoDate(d)).toBe("2026-05-18");
  expect(localDateFromIso("2026-05-18").getDate()).toBe(18);
});

test("addDays(today, 1) is tomorrow", () => {
  const today = new Date(2026, 4, 18);
  expect(isoDate(addDays(today, 1))).toBe("2026-05-19");
});
