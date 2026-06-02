/**
 * Admin /security server-action tests (§01 §5a.2 phase 2 sub-unit A).
 *
 * The actions are thin wrappers around mfa.ts helpers. These tests verify:
 *   - happy-path data shape (startTotpEnrolment returns the QR/uri/secret)
 *   - actorRole threading — every helper call passes `"tavli_admin"`
 *   - password-policy boundary (too_short vs pwned → friendly messages,
 *     ok path forwards to mfa.changePassword)
 *   - signed-out guard ("Not signed in." when getUser returns null)
 *   - redirects on changePassword + signOutEverywhere happy paths
 *
 * All Supabase / mfa / password-policy / next-navigation imports are
 * mocked; redirect is mocked to throw so we can assert it was called.
 */

jest.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("@/lib/auth/mfa");
jest.mock("@/lib/auth/password-policy");
// Localized action error strings resolve via resolveAppLocale → pin to "en" so
// getMessages returns the EN (verbatim oracle) strings the assertions expect.
jest.mock("@/lib/i18n/app-locale", () => ({
  resolveAppLocale: jest.fn().mockResolvedValue("en"),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import * as mfa from "@/lib/auth/mfa";
import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  startTotpEnrolment,
  verifyTotpStep,
  unenrolFactorAction,
  regenerateRecoveryCodes,
  changePasswordAction,
  signOutEverywhereAction,
} from "../actions";

const ROLE = "tavli_admin" as const;

function fakeSupabase(
  user: { id: string; email: string } | null = { id: "u1", email: "u@x" },
) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user } }),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (createSupabaseServerClient as jest.Mock).mockResolvedValue(fakeSupabase());
});

describe("startTotpEnrolment", () => {
  it("returns enrolment data on success", async () => {
    (mfa.enrolTotpFactor as jest.Mock).mockResolvedValue({
      ok: true,
      factorId: "f1",
      qrCodeSvg: "<svg/>",
      uri: "otpauth://...",
      secret: "ABC",
    });
    const result = await startTotpEnrolment();
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      factorId: "f1",
      qrCodeSvg: "<svg/>",
      uri: "otpauth://...",
      secret: "ABC",
    });
    expect(mfa.enrolTotpFactor).toHaveBeenCalledWith(
      expect.anything(),
      "Authenticator app",
    );
  });

  it("returns error when helper fails", async () => {
    (mfa.enrolTotpFactor as jest.Mock).mockResolvedValue({
      ok: false,
      error: "no permission",
    });
    expect(await startTotpEnrolment()).toEqual({
      ok: false,
      error: "no permission",
    });
  });
});

describe("verifyTotpStep", () => {
  it("passes role + ids through to verifyTotpEnrollment", async () => {
    (mfa.verifyTotpEnrollment as jest.Mock).mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("factor_id", "f1");
    fd.set("code", "123456");
    const r = await verifyTotpStep({ ok: false }, fd);
    expect(r.ok).toBe(true);
    expect(mfa.verifyTotpEnrollment).toHaveBeenCalledWith(
      expect.anything(),
      "f1",
      "123456",
      "u1",
      ROLE,
    );
  });

  it("validates code presence", async () => {
    const fd = new FormData();
    fd.set("factor_id", "f1");
    const r = await verifyTotpStep({ ok: false }, fd);
    expect(r).toEqual({ ok: false, error: "Code is required." });
    expect(mfa.verifyTotpEnrollment).not.toHaveBeenCalled();
  });

  it("returns Not signed in when no user", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      fakeSupabase(null),
    );
    const fd = new FormData();
    fd.set("factor_id", "f1");
    fd.set("code", "123456");
    const r = await verifyTotpStep({ ok: false }, fd);
    expect(r).toEqual({ ok: false, error: "Not signed in." });
  });

  it("propagates helper error", async () => {
    (mfa.verifyTotpEnrollment as jest.Mock).mockResolvedValue({
      ok: false,
      error: "Invalid code.",
    });
    const fd = new FormData();
    fd.set("factor_id", "f1");
    fd.set("code", "999999");
    const r = await verifyTotpStep({ ok: false }, fd);
    expect(r).toEqual({ ok: false, error: "Invalid code." });
  });
});

describe("unenrolFactorAction", () => {
  it("calls unenrollFactor with role threading", async () => {
    (mfa.unenrollFactor as jest.Mock).mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("factor_id", "f1");
    const r = await unenrolFactorAction({ ok: false }, fd);
    expect(r).toEqual({ ok: true });
    expect(mfa.unenrollFactor).toHaveBeenCalledWith(
      expect.anything(),
      "f1",
      "u1",
      ROLE,
    );
  });

  it("requires factor_id", async () => {
    const fd = new FormData();
    const r = await unenrolFactorAction({ ok: false }, fd);
    expect(r).toEqual({ ok: false, error: "Factor required." });
    expect(mfa.unenrollFactor).not.toHaveBeenCalled();
  });

  it("returns Not signed in when no user", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      fakeSupabase(null),
    );
    const fd = new FormData();
    fd.set("factor_id", "f1");
    const r = await unenrolFactorAction({ ok: false }, fd);
    expect(r).toEqual({ ok: false, error: "Not signed in." });
  });

  it("defaults error message when helper omits one", async () => {
    (mfa.unenrollFactor as jest.Mock).mockResolvedValue({ ok: false });
    const fd = new FormData();
    fd.set("factor_id", "f1");
    const r = await unenrolFactorAction({ ok: false }, fd);
    expect(r).toEqual({ ok: false, error: "Could not remove factor." });
  });
});

describe("regenerateRecoveryCodes", () => {
  it("calls generateRecoveryCodes with userId + role and returns codes", async () => {
    (mfa.generateRecoveryCodes as jest.Mock).mockResolvedValue([
      "a-b-c",
      "d-e-f",
    ]);
    const r = await regenerateRecoveryCodes();
    expect(r).toEqual({ ok: true, data: { codes: ["a-b-c", "d-e-f"] } });
    expect(mfa.generateRecoveryCodes).toHaveBeenCalledWith("u1", ROLE);
  });

  it("returns Not signed in when no user", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      fakeSupabase(null),
    );
    const r = await regenerateRecoveryCodes();
    expect(r).toEqual({ ok: false, error: "Not signed in." });
    expect(mfa.generateRecoveryCodes).not.toHaveBeenCalled();
  });
});

describe("changePasswordAction", () => {
  it("returns error when passwords don't match", async () => {
    const fd = new FormData();
    fd.set("current_password", "old");
    fd.set("new_password", "new1");
    fd.set("confirm_password", "new2");
    const r = await changePasswordAction({ ok: false }, fd);
    expect(r).toEqual({ ok: false, error: "New passwords don't match." });
    expect(validatePasswordPolicy).not.toHaveBeenCalled();
  });

  it("returns error when policy says too short", async () => {
    (validatePasswordPolicy as jest.Mock).mockResolvedValue({
      ok: false,
      reason: "too_short",
    });
    const fd = new FormData();
    fd.set("current_password", "old");
    fd.set("new_password", "short");
    fd.set("confirm_password", "short");
    const r = await changePasswordAction({ ok: false }, fd);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/8 characters/i);
    expect(mfa.changePassword).not.toHaveBeenCalled();
  });

  it("returns error when policy says pwned", async () => {
    (validatePasswordPolicy as jest.Mock).mockResolvedValue({
      ok: false,
      reason: "pwned",
    });
    const fd = new FormData();
    fd.set("current_password", "old");
    fd.set("new_password", "Password123");
    fd.set("confirm_password", "Password123");
    const r = await changePasswordAction({ ok: false }, fd);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/breach/i);
    expect(mfa.changePassword).not.toHaveBeenCalled();
  });

  it("calls changePassword with role on happy path then redirects", async () => {
    (validatePasswordPolicy as jest.Mock).mockResolvedValue({ ok: true });
    (mfa.changePassword as jest.Mock).mockResolvedValue({ ok: true });
    const fd = new FormData();
    fd.set("current_password", "old-pass");
    fd.set("new_password", "new-pass-1234");
    fd.set("confirm_password", "new-pass-1234");
    await expect(changePasswordAction({ ok: false }, fd)).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expect(mfa.changePassword).toHaveBeenCalledWith(
      "old-pass",
      "new-pass-1234",
      expect.objectContaining({
        supabase: expect.anything(),
        makeTransientClient: expect.any(Function),
      }),
      ROLE,
    );
    expect(redirect).toHaveBeenCalledWith(
      "/admin/sign-in?password_changed=1",
    );
  });

  it("returns helper error without redirecting when changePassword fails", async () => {
    (validatePasswordPolicy as jest.Mock).mockResolvedValue({ ok: true });
    (mfa.changePassword as jest.Mock).mockResolvedValue({
      ok: false,
      error: "Current password is incorrect.",
    });
    const fd = new FormData();
    fd.set("current_password", "wrong");
    fd.set("new_password", "new-pass-1234");
    fd.set("confirm_password", "new-pass-1234");
    const r = await changePasswordAction({ ok: false }, fd);
    expect(r).toEqual({
      ok: false,
      error: "Current password is incorrect.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("signOutEverywhereAction", () => {
  it("calls signOutEverywhere with role then redirects", async () => {
    (mfa.signOutEverywhere as jest.Mock).mockResolvedValue(undefined);
    await expect(signOutEverywhereAction()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mfa.signOutEverywhere).toHaveBeenCalledWith(
      expect.anything(),
      ROLE,
    );
    expect(redirect).toHaveBeenCalledWith("/admin/sign-in?signed_out=1");
  });
});
