/**
 * @jest-environment node
 *
 * i18n regression guard (Phase 1b).
 *
 * Scans the localized consumer route tree (`src/app/(public)/[lang]/`) for
 * hardcoded Romanian — i.e. string content containing Romanian-specific
 * diacritics (ă â î ș ț) outside imports/comments. Every user-facing string in
 * this tree should live in a message catalogue (`src/messages/<locale>/*.json`)
 * and be rendered via `t()` / `getMessages`, so any remaining RO diacritic here
 * is almost certainly an un-extracted string that an EN/DE diner would see.
 *
 * Scope & limits (intentional):
 * - Diacritic-based: catches the common case. Diacritic-free Romanian
 *   ("Meniu", "Salut") is NOT caught — those were handled during the per-area
 *   extraction (verified by the RO-asserting component tests).
 * - Scoped to the `[lang]` route tree. Shared components in `src/components`
 *   are excluded (they are also used by the not-yet-localized partner/admin
 *   surfaces; they were converted + verified per-area in Phase 1b).
 *
 * Allowlist mechanisms:
 * - A line containing `i18n-allow` is skipped (use for one-off legitimate
 *   non-UI literals, e.g. a DB value).
 * - A line containing `i18n-allow-block` skips lines until the block's closing
 *   `}`/`]` line (use for data maps that are content, not UI chrome).
 * - DEFERRED_FILES are excluded wholesale, tracked for a localization follow-up.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "app", "(public)", "[lang]");
const RO_DIACRITIC = /[ăâîșțĂÂÎȘȚ]/;

/**
 * Files whose Romanian strings are knowingly deferred to a localization
 * follow-up. All Phase 1b-finalize items have been resolved; this list is now
 * empty — tracked here for documentation purposes only.
 */
const DEFERRED_FILES: string[] = [];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function offendingLines(source: string): { line: number; text: string }[] {
  const lines = source.split("\n");
  const hits: { line: number; text: string }[] = [];
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (inBlock) {
      // End the block at its closing brace/bracket line.
      if (/^[}\]]/.test(trimmed)) inBlock = false;
      continue;
    }
    if (trimmed.includes("i18n-allow-block")) {
      inBlock = true;
      continue;
    }
    if (trimmed.includes("i18n-allow")) continue;
    if (trimmed.startsWith("import ") || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }
    if (RO_DIACRITIC.test(raw)) hits.push({ line: i + 1, text: trimmed });
  }
  return hits;
}

describe("i18n regression guard: no hardcoded Romanian in the [lang] consumer tree", () => {
  const files = walk(ROOT).filter((f) => !DEFERRED_FILES.includes(f));

  it("scans a non-trivial number of files (guard is wired)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("has no un-extracted Romanian (diacritic) strings", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const hits = offendingLines(readFileSync(file, "utf8"));
      for (const h of hits) {
        offenders.push(`${file.replace(ROOT, "[lang]")}:${h.line}  ${h.text}`);
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        "Found hardcoded Romanian in the localized consumer tree. Extract each " +
          "string into a message catalogue (src/messages/<locale>/*.json) and render " +
          "via t()/getMessages, or mark legitimate non-UI literals with `// i18n-allow`:\n" +
          offenders.join("\n"),
      );
    }
    expect(offenders).toEqual([]);
  });
});
