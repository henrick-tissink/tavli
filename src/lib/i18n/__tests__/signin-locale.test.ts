import { makeReconcileSignInLocale } from "../signin-locale";

function makeDeps(cookieLocale: string | undefined) {
  return {
    readCookie: jest.fn().mockResolvedValue(cookieLocale),
    setCookie: jest.fn().mockResolvedValue(undefined),
    updateProfileLocale: jest.fn().mockResolvedValue(undefined),
  };
}

describe("reconcileSignInLocale", () => {
  it("persists the cookie locale into the profile when they differ (cookie wins)", async () => {
    const deps = makeDeps("en");
    await makeReconcileSignInLocale(deps)("user-1", "ro");
    expect(deps.updateProfileLocale).toHaveBeenCalledWith("user-1", "en");
    expect(deps.setCookie).not.toHaveBeenCalled();
  });

  it("does nothing when cookie and profile already agree", async () => {
    const deps = makeDeps("en");
    await makeReconcileSignInLocale(deps)("user-1", "en");
    expect(deps.updateProfileLocale).not.toHaveBeenCalled();
    expect(deps.setCookie).not.toHaveBeenCalled();
  });

  it("sets the cookie from the profile when no cookie exists", async () => {
    const deps = makeDeps(undefined);
    await makeReconcileSignInLocale(deps)("user-1", "de");
    expect(deps.setCookie).toHaveBeenCalledWith("de");
    expect(deps.updateProfileLocale).not.toHaveBeenCalled();
  });

  it("treats an invalid cookie value as absent", async () => {
    const deps = makeDeps("xx");
    await makeReconcileSignInLocale(deps)("user-1", "ro");
    expect(deps.setCookie).toHaveBeenCalledWith("ro");
    expect(deps.updateProfileLocale).not.toHaveBeenCalled();
  });

  it("does nothing when neither a valid cookie nor a valid profile locale exists", async () => {
    const deps = makeDeps(undefined);
    await makeReconcileSignInLocale(deps)("user-1", null);
    expect(deps.setCookie).not.toHaveBeenCalled();
    expect(deps.updateProfileLocale).not.toHaveBeenCalled();
  });
});
