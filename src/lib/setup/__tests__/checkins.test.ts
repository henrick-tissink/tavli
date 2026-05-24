/**
 * @jest-environment node
 */
import { makeSendDayNCheckin } from "@/lib/setup/checkins";
import { makeFlagAtRiskOrgs } from "@/lib/setup/flag-at-risk";

describe("makeSendDayNCheckin", () => {
  test("emails each restaurant created N days ago, skipping ones without an email", async () => {
    const db = {
      execute: jest.fn(async () => [
        { id: "r1", name: "Tom Yum", organization_id: "o1", email: "owner@x.com", locale: "ro" },
        { id: "r2", name: "No Email", organization_id: "o1", email: null, locale: "en" },
      ]),
    };
    const sendEmail = jest.fn(async (_i: { to: string; templateKey: string }) => ({ ok: true }));
    const renderEmail = jest.fn(async () => ({ html: "<p>hi</p>", text: "hi" }));
    await makeSendDayNCheckin({ db: db as never, sendEmail: sendEmail as never, renderEmail }, 7)();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: "owner@x.com", templateKey: "setup_checkin_day_7" });
  });
});

describe("makeFlagAtRiskOrgs", () => {
  test("alerts each at-risk org", async () => {
    const db = { execute: jest.fn(async () => [{ organization_id: "o1", trial_ends_at: "2026-06-10" }]) };
    const alert = jest.fn(async (_i: { organizationId: string; trialEndsAt: string }) => {});
    await makeFlagAtRiskOrgs({ db: db as never, alert })();
    expect(alert).toHaveBeenCalledWith({ organizationId: "o1", trialEndsAt: "2026-06-10" });
  });

  test("no at-risk orgs → no alerts", async () => {
    const db = { execute: jest.fn(async () => []) };
    const alert = jest.fn(async () => {});
    await makeFlagAtRiskOrgs({ db: db as never, alert })();
    expect(alert).not.toHaveBeenCalled();
  });
});
