import robots from "@/app/robots";

describe("robots", () => {
  const originalSite = process.env.NEXT_PUBLIC_SITE_URL;
  const originalDemo = process.env.DEMO_MODE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tavli.ro";
  });

  afterEach(() => {
    if (originalSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSite;
    if (originalDemo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemo;
  });

  test("normal mode: allows crawl of public pages, disallows app surfaces, lists sitemap", () => {
    delete process.env.DEMO_MODE;
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule?.allow).toBe("/");
    expect(rule?.disallow).toEqual([
      "/admin/",
      "/partner/",
      "/onboard/",
      "/reservations/",
    ]);
    expect(result.sitemap).toBe("https://tavli.ro/sitemap.xml");
  });

  test("demo mode: disallows the entire site and advertises no sitemap", () => {
    process.env.DEMO_MODE = "true";
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule?.userAgent).toBe("*");
    expect(rule?.disallow).toBe("/");
    expect(rule?.allow).toBeUndefined();
    expect(result.sitemap).toBeUndefined();
  });
});
