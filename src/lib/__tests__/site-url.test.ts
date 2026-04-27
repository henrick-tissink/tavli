import { getSiteUrl } from "@/lib/site-url";

describe("getSiteUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalEnv;
    }
  });

  test("returns NEXT_PUBLIC_SITE_URL when set", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tavli.ro";
    expect(getSiteUrl()).toBe("https://tavli.ro");
  });

  test("falls back to localhost when env is missing", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  test("strips a trailing slash so concatenation never double-slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tavli.ro/";
    expect(getSiteUrl()).toBe("https://tavli.ro");
  });
});
