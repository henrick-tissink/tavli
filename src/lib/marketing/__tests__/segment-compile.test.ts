import { compileSegmentFilter, type SegmentCondition } from "@/lib/marketing/segment-compile";

describe("compileSegmentFilter", () => {
  test("returns an SQL predicate for valid conditions (AND)", () => {
    const out = compileSegmentFilter(
      [
        { dimension: "frequency", bucket: "regular" },
        { dimension: "channel", source: "widget" },
      ],
      "and",
    );
    expect(out).toBeTruthy();
    expect(typeof out).toBe("object");
  });

  test("supports OR + negate without throwing", () => {
    expect(() =>
      compileSegmentFilter([{ dimension: "occasion", tag: "birthday" }], "or", { negate: true }),
    ).not.toThrow();
  });

  test("each supported dimension compiles", () => {
    const dims: SegmentCondition[] = [
      { dimension: "recency", notWithinDays: 60 },
      { dimension: "recency", withinDays: 30 },
      { dimension: "frequency", bucket: "lapsed" },
      { dimension: "party_size", min: 2, max: 4 },
      { dimension: "occasion", tag: "anniversary" },
      { dimension: "channel", source: "editorial" },
    ];
    for (const c of dims) expect(() => compileSegmentFilter([c], "and")).not.toThrow();
  });

  test("empty conditions throw", () => {
    expect(() => compileSegmentFilter([], "and")).toThrow(/segment_empty/);
  });

  test("unknown dimension throws", () => {
    expect(() => compileSegmentFilter([{ dimension: "service" } as never], "and")).toThrow(/unknown_dimension/);
  });
});
