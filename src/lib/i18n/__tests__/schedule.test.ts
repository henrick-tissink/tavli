jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/restaurants/current-user", () => ({ currentUserPrimaryRestaurant: jest.fn() }));

import { localizeSchedule, RO_SCHEDULE_DAY_NAMES } from "../schedule";
import { hoursToSchedule } from "@/lib/onboarding";

describe("localizeSchedule", () => {
  const schedule = [
    { days: "Luni – Sâmbătă", hours: "11:00 – 22:00" },
    { days: "Duminică", hours: "12:00 – 21:00" },
    { days: "Marți", hours: "Închis" },
  ];

  it("returns entries unchanged for RO", () => {
    expect(localizeSchedule(schedule, "ro")).toEqual(schedule);
  });

  it("translates day names and 'Închis' for EN", () => {
    expect(localizeSchedule(schedule, "en")).toEqual([
      { days: "Monday – Saturday", hours: "11:00 – 22:00" },
      { days: "Sunday", hours: "12:00 – 21:00" },
      { days: "Tuesday", hours: "Closed" },
    ]);
  });

  it("translates day names and 'Închis' for DE", () => {
    expect(localizeSchedule(schedule, "de")).toEqual([
      { days: "Montag – Samstag", hours: "11:00 – 22:00" },
      { days: "Sonntag", hours: "12:00 – 21:00" },
      { days: "Dienstag", hours: "Geschlossen" },
    ]);
  });

  it("passes through unknown tokens untouched (already-localized mock data)", () => {
    const mock = [{ days: "Mon–Fri", hours: "12:00 – 23:00" }];
    expect(localizeSchedule(mock, "en")).toEqual(mock);
  });
});

describe("writer/translator coupling", () => {
  it("everything hoursToSchedule emits is fully translatable for EN and DE", () => {
    // Exercise grouping, single days, and closed days across the whole week.
    const written = hoursToSchedule([
      { dayOfWeek: 1, isOpen: true, openAt: "12:00", closeAt: "23:00" },
      { dayOfWeek: 2, isOpen: true, openAt: "12:00", closeAt: "23:00" },
      { dayOfWeek: 3, isOpen: false, openAt: "", closeAt: "" },
      { dayOfWeek: 4, isOpen: true, openAt: "18:00", closeAt: "22:00" },
      { dayOfWeek: 5, isOpen: true, openAt: "12:00", closeAt: "23:30" },
      { dayOfWeek: 6, isOpen: true, openAt: "12:00", closeAt: "23:30" },
      { dayOfWeek: 0, isOpen: false, openAt: "", closeAt: "" },
    ]);
    for (const locale of ["en", "de"] as const) {
      const localized = localizeSchedule(written, locale);
      const flat = JSON.stringify(localized);
      for (const roDay of RO_SCHEDULE_DAY_NAMES) {
        expect(flat).not.toContain(roDay);
      }
      expect(flat).not.toContain("Închis");
    }
  });
});
