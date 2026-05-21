import { csvStringify } from "../stringify";

describe("csvStringify", () => {
  it("emits the header row only when rows are empty", () => {
    const out = csvStringify([], [
      { key: "name", header: "Name" },
      { key: "qty", header: "Qty" },
    ]);
    expect(out).toBe("Name,Qty");
  });

  it("joins plain values with commas and \\r\\n between rows", () => {
    const out = csvStringify(
      [
        { name: "Alpha", qty: 1 },
        { name: "Beta", qty: 2 },
      ],
      [
        { key: "name", header: "Name" },
        { key: "qty", header: "Qty" },
      ],
    );
    expect(out).toBe("Name,Qty\r\nAlpha,1\r\nBeta,2");
  });

  it("escapes fields with quotes, commas, and newlines per RFC 4180", () => {
    const out = csvStringify(
      [
        { note: 'has "quotes"' },
        { note: "has, comma" },
        { note: "line\nbreak" },
        { note: null },
      ],
      [{ key: "note", header: "Note" }],
    );
    expect(out).toBe(
      'Note\r\n"has ""quotes"""\r\n"has, comma"\r\n"line\nbreak"\r\n',
    );
  });
});
