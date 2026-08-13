/**
 * @jest-environment node
 */
const mockFrom = jest.fn();
let anonClient: unknown = { from: mockFrom };

jest.mock("@/lib/db/anon", () => ({ supabaseAnon: () => anonClient }));

/** Build the `.select().eq().limit()` chain the repo uses. */
function chain(result: { data?: unknown[]; error?: { message: string } }) {
  return {
    select: () => ({ eq: () => ({ limit: () => Promise.resolve(result) }) }),
  };
}

describe("isServedCity", () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_USE_DB;

  beforeEach(() => {
    jest.resetModules();
    mockFrom.mockReset();
    anonClient = { from: mockFrom };
    process.env.NEXT_PUBLIC_USE_DB = "true";
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_USE_DB = ORIGINAL;
  });

  async function load() {
    return (await import("../cities-repo")).isServedCity;
  }

  it("serves a city the anon client can see", async () => {
    mockFrom.mockReturnValue(chain({ data: [{ slug: "bucuresti" }] }));
    expect(await (await load())("bucuresti")).toBe(true);
  });

  it("404s a slug with no row — the doorway-page regression", async () => {
    // `/never-was-a-city-xyz` returned 200 with a branded hero before this.
    mockFrom.mockReturnValue(chain({ data: [] }));
    expect(await (await load())("never-was-a-city-xyz")).toBe(false);
  });

  it("404s an inactive city, because RLS hides it from anon reads", async () => {
    // cities_public_read is `using (is_active = true or is_admin())`, so an
    // inactive seed comes back as zero rows — no extra filter needed here.
    mockFrom.mockReturnValue(chain({ data: [] }));
    expect(await (await load())("cluj")).toBe(false);
  });

  it("404s an empty slug without querying", async () => {
    expect(await (await load())("")).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("fails OPEN when the query errors, so a DB blip cannot 404 the storefront", async () => {
    mockFrom.mockReturnValue(chain({ error: { message: "connection reset" } }));
    expect(await (await load())("bucuresti")).toBe(true);
  });

  it("fails OPEN when the query throws", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          limit: () => Promise.reject(new Error("socket hang up")),
        }),
      }),
    });
    expect(await (await load())("bucuresti")).toBe(true);
  });

  it("falls back to the i18n catalogue in mock mode (no Supabase configured)", async () => {
    process.env.NEXT_PUBLIC_USE_DB = "false";
    anonClient = null;
    const isServedCity = await load();
    // Local dev runs without a database; all six catalogue cities must render.
    expect(await isServedCity("bucuresti")).toBe(true);
    expect(await isServedCity("cluj")).toBe(true);
    expect(await isServedCity("never-was-a-city-xyz")).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
