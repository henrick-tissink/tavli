/**
 * @jest-environment node
 */

import { z } from "zod";
import {
  conflict,
  fail,
  forbidden,
  invalid,
  notFound,
  ok,
  rateLimited,
  unauthenticated,
  type ActionResult,
} from "../server-action";

describe("server-action helpers", () => {
  it("ok wraps data", () => {
    const r = ok({ id: "1" });
    expect(r).toEqual({ ok: true, data: { id: "1" } });
  });

  it("fail carries code, message, fields", () => {
    const r = fail("TV002", "slot full", { time: "taken" });
    expect(r).toEqual({
      ok: false,
      code: "TV002",
      message: "slot full",
      fields: { time: "taken" },
    });
  });

  it("invalid maps zod issues to dotted-path fields", () => {
    const schema = z.object({
      guest: z.object({ email: z.string().email() }),
      party_size: z.number().int().positive(),
    });
    const parsed = schema.safeParse({
      guest: { email: "nope" },
      party_size: -1,
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const r = invalid(parsed.error);
    if (r.ok) throw new Error("expected failure");
    expect(r.code).toBe("invalid_input");
    expect(r.fields).toBeDefined();
    expect(Object.keys(r.fields!).sort()).toEqual(["guest.email", "party_size"]);
  });

  it("named shorthands set the right cross-cutting code", () => {
    expect(unauthenticated()).toMatchObject({ code: "unauthenticated" });
    expect(forbidden()).toMatchObject({ code: "forbidden" });
    expect(notFound()).toMatchObject({ code: "not_found" });
    expect(conflict("dup")).toMatchObject({ code: "conflict", message: "dup" });
    expect(rateLimited()).toMatchObject({ code: "rate_limited" });
  });

  it("type narrows on ok discriminant", () => {
    const r: ActionResult<{ id: string }> = ok({ id: "x" });
    if (r.ok) {
      // Inside the type-narrowed branch, `data` is the success payload.
      expect(r.data.id).toBe("x");
    } else {
      throw new Error("unreachable");
    }
  });
});
