/**
 * @jest-environment node
 *
 * Regression guard for the locale switcher's cache blast radius.
 *
 * `revalidatePath("/", "layout")` invalidates the `_N_T_/layout` soft tag, which
 * every route in the app carries — including the prerendered `(public)/[lang]`
 * storefront. Those entries then have nothing to serve and 404 permanently until
 * the next deploy. A partner switching language in the sidebar took the
 * demo.tavli.ro homepage down this way for nine days (2026-07-25 → 2026-08-03).
 *
 * The switcher does not need a purge: each locale has its own URL, and the
 * partner/admin pages that share a URL across locales are dynamic, so a
 * client-side `router.refresh()` re-renders them.
 */

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getCurrentSession } from "@/lib/auth/session";
import { setAppLocale } from "../locale-action";

const setCookie = jest.fn();
const mockCookies = cookies as jest.MockedFunction<typeof cookies>;
const mockSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>;

beforeEach(() => {
  jest.clearAllMocks();
  mockCookies.mockResolvedValue({ set: setCookie } as never);
  // Signed-out visitor: the cookie is the only thing written, so the action
  // never reaches the database.
  mockSession.mockResolvedValue(null);
});

test("persists the chosen locale in the NEXT_LOCALE cookie", async () => {
  await setAppLocale("de");

  expect(setCookie).toHaveBeenCalledWith(
    "NEXT_LOCALE",
    "de",
    expect.objectContaining({ path: "/" }),
  );
});

test("does not invalidate the root layout, which would 404 the whole storefront", async () => {
  await setAppLocale("en");

  const rootPurges = mockRevalidatePath.mock.calls.filter(([path]) => path === "/");
  expect(rootPurges).toEqual([]);
});
