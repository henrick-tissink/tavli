/**
 * csvStringify — minimal RFC 4180 CSV writer (no library dependency).
 *
 * Escapes fields that contain `,`, `"`, `\n`, or `\r` by wrapping in
 * double-quotes and doubling internal quotes. Line ending is `\r\n` per
 * RFC 4180; the header row is the first line.
 *
 * Hand-rolled because the codebase doesn't have a CSV dependency, the
 * escape rules are trivial, and the volume of data is small. If we ever
 * need streaming or schema-aware export, swap to `csv-stringify`.
 */

export interface CsvColumn {
  key: string;
  header: string;
}

type Cell = string | number | null | undefined;
export type CsvRow = Record<string, Cell>;

const SHOULD_ESCAPE = /[",\r\n]/;

function escapeField(value: Cell): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (!SHOULD_ESCAPE.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

export function csvStringify(rows: CsvRow[], columns: CsvColumn[]): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => escapeField(c.header)).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => escapeField(row[c.key])).join(","));
  }
  return lines.join("\r\n");
}
