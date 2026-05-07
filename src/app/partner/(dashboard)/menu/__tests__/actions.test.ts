/**
 * @jest-environment node
 */

import { saveItem } from "../actions";

jest.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

import { createSupabaseServerClient } from "@/lib/db/server";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

function makeSupabase(restaurantId: string | null) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    from: jest.fn((table: string) => {
      if (table === "restaurants") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: restaurantId ? { id: restaurantId } : null,
          }),
        };
      }
      if (table === "menu_items") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: { sort_order: 0 } }),
          insert: jest.fn().mockResolvedValue({ error: null }),
          update: jest.fn().mockReturnThis(),
        };
      }
      return {};
    }),
  };
}

describe("saveItem — UUID validation", () => {
  beforeEach(() => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabase(VALID_UUID));
  });

  it("rejects empty sectionId with a friendly message — never reaches DB", async () => {
    const sb = makeSupabase(VALID_UUID);
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(sb);

    const result = await saveItem({
      sectionId: "",
      name: "Pizza",
      description: "",
      priceLei: 10,
      dietaryTags: [],
      isChefPick: false,
      isAvailable: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/secțiune/i);
    // No insert should have happened.
    const calls = sb.from.mock.calls.map((c: [string]) => c[0]);
    expect(calls).not.toContain("menu_items");
  });

  it("rejects non-UUID sectionId", async () => {
    const result = await saveItem({
      sectionId: "not-a-uuid",
      name: "Pizza",
      description: "",
      priceLei: 10,
      dietaryTags: [],
      isChefPick: false,
      isAvailable: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/secțiune/i);
  });

  it("rejects empty id on update", async () => {
    const result = await saveItem({
      id: "",
      sectionId: VALID_UUID,
      name: "Pizza",
      description: "",
      priceLei: 10,
      dietaryTags: [],
      isChefPick: false,
      isAvailable: true,
    });
    expect(result.ok).toBe(false);
  });

  it("happy path with a valid sectionId still works", async () => {
    const result = await saveItem({
      sectionId: VALID_UUID,
      name: "Pizza",
      description: "Cheese",
      priceLei: 25,
      dietaryTags: ["vegetarian"],
      isChefPick: false,
      isAvailable: true,
    });
    expect(result.ok).toBe(true);
  });
});
