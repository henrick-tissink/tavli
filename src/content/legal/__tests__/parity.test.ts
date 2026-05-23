import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOCS = ["privacy", "terms", "cookies", "anpc", "data-processing", "imprint"] as const;

function extractHeadingLevels(mdxPath: string): string[] {
  const content = readFileSync(mdxPath, "utf8");
  const levels: string[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^(#{1,6})\s/);
    if (m) levels.push(m[1]);
  }
  return levels;
}

describe("legal content RO/EN structural parity", () => {
  it.each(DOCS)(
    "%s: RO and EN have identical heading-level sequences",
    (doc) => {
      const roPath = resolve(__dirname, `../ro/${doc}.mdx`);
      const enPath = resolve(__dirname, `../en/${doc}.mdx`);
      const ro = extractHeadingLevels(roPath);
      const en = extractHeadingLevels(enPath);
      expect(en).toEqual(ro);
    },
  );
});
