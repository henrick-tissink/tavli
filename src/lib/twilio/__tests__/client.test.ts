/**
 * @jest-environment node
 */

describe("getTwilio", () => {
  const originalSid = process.env.TWILIO_ACCOUNT_SID;
  const originalToken = process.env.TWILIO_AUTH_TOKEN;

  afterEach(() => {
    if (originalSid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
    else process.env.TWILIO_ACCOUNT_SID = originalSid;
    if (originalToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = originalToken;
    jest.resetModules();
  });

  it("throws when TWILIO_ACCOUNT_SID is missing", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    process.env.TWILIO_AUTH_TOKEN = "tok";
    jest.resetModules();
    const { getTwilio } = await import("../client");
    expect(() => getTwilio()).toThrow(/TWILIO_ACCOUNT_SID/);
  });

  it("throws when TWILIO_AUTH_TOKEN is missing", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACdummy";
    delete process.env.TWILIO_AUTH_TOKEN;
    jest.resetModules();
    const { getTwilio } = await import("../client");
    expect(() => getTwilio()).toThrow(/TWILIO_AUTH_TOKEN/);
  });

  it("returns a singleton when both env vars are present", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACdummyforconstructiononly0000000";
    process.env.TWILIO_AUTH_TOKEN = "dummy_token_construction_only";
    jest.resetModules();
    const { getTwilio } = await import("../client");
    const a = getTwilio();
    const b = getTwilio();
    expect(a).toBe(b);
  });
});
