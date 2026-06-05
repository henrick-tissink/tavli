import { localizeSchedule } from "../schedule";

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
