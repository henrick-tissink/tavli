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

describe("legal content RO/EN/DE structural parity", () => {
  it.each(DOCS)(
    "%s: RO and EN have identical heading-level sequences",
    (doc) => {
      const ro = extractHeadingLevels(resolve(__dirname, `../ro/${doc}.mdx`));
      const en = extractHeadingLevels(resolve(__dirname, `../en/${doc}.mdx`));
      expect(en).toEqual(ro);
    },
  );

  it.each(DOCS)(
    "%s: RO and DE have identical heading-level sequences",
    (doc) => {
      const ro = extractHeadingLevels(resolve(__dirname, `../ro/${doc}.mdx`));
      const de = extractHeadingLevels(resolve(__dirname, `../de/${doc}.mdx`));
      expect(de).toEqual(ro);
    },
  );
});
