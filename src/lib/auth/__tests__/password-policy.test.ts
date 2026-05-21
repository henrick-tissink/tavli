import { validatePasswordPolicy } from "../password-policy";

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
// → prefix 5BAA6, suffix 1E4C9B93F3F0682250B6CF8331B7EE68FD8

const PWNED_PASSWORD = "password";
const PWNED_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

function makeFetcher(
  body: string,
  init: { ok?: boolean; status?: number } = {},
): jest.MockedFunction<typeof fetch> {
  const fn: typeof fetch = async (
    _input: string | URL | Request,
    _opts?: RequestInit,
  ) =>
    ({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      text: async () => body,
    } as unknown as Response);
  return jest.fn(fn) as jest.MockedFunction<typeof fetch>;
}

describe("validatePasswordPolicy", () => {
  it("rejects passwords shorter than 8 characters with reason 'too_short' (no HIBP call)", async () => {
    const fetcher = makeFetcher("");
    const result = await validatePasswordPolicy("short", fetcher);
    expect(result).toEqual({ ok: false, reason: "too_short" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects breached passwords with reason 'pwned' when HIBP returns the suffix", async () => {
    const fetcher = makeFetcher(`${PWNED_SUFFIX}:9999999\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1`);
    const result = await validatePasswordPolicy(PWNED_PASSWORD, fetcher);
    expect(result).toEqual({ ok: false, reason: "pwned" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls[0][0] as string)).toMatch(/\/5BAA6$/);
  });

  it("accepts a strong password when HIBP returns no matching suffix", async () => {
    const fetcher = makeFetcher("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0:1");
    const result = await validatePasswordPolicy(
      "this-is-a-strong-passphrase-2026",
      fetcher,
    );
    expect(result).toEqual({ ok: true });
  });

  it("fail-opens (returns ok) when the HIBP API returns a non-OK status", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = makeFetcher("", { ok: false, status: 503 });
    const result = await validatePasswordPolicy(
      "this-is-another-decent-passphrase",
      fetcher,
    );
    expect(result).toEqual({ ok: true });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("HIBP check failed"),
    );
    warn.mockRestore();
  });

  it("fail-opens when fetch throws (network outage)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const throwingFn: typeof fetch = async (
      _input: string | URL | Request,
      _opts?: RequestInit,
    ) => {
      throw new Error("ENOTFOUND");
    };
    const fetcher = jest.fn(throwingFn) as jest.MockedFunction<typeof fetch>;
    const result = await validatePasswordPolicy(
      "yet-another-passphrase-here",
      fetcher,
    );
    expect(result).toEqual({ ok: true });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("HIBP check failed"),
    );
    warn.mockRestore();
  });
});
