/**
 * Row-level locale fallback helper per §05 §4.3.
 * Exported for cross-domain reuse (menu items, sections, photos, etc.).
 */

export interface TranslationLike {
  name: string | null;
  tagline: string | null;
  descriptionShort: string | null;
}

export interface PickResult<T> {
  row: T;
  usedFallback: boolean;
}

/**
 * Row-level locale fallback per §05 §4.3. If ANY of the required-for-publication
 * fields is null/empty in the requested locale, fall back to RO entirely.
 */
export function pickTranslationRow<T extends TranslationLike>(input: {
  requested: T | null;
  ro: T;
}): PickResult<T> {
  const r = input.requested;
  const requiredComplete =
    r !== null &&
    r.name !== null && r.name.length > 0 &&
    r.tagline !== null && r.tagline.length > 0 &&
    r.descriptionShort !== null && r.descriptionShort.length > 0;
  return requiredComplete
    ? { row: r!, usedFallback: false }
    : { row: input.ro, usedFallback: true };
}
