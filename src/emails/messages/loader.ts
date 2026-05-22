/**
 * Stub locale loader — Wave 3 ships RO-only copy embedded in templates.
 * EN/DE catalogues are scaffolded but empty; loader falls back to RO.
 *
 * Future work: load JSON catalogues per locale + template; merge with
 * template-supplied defaults. Until then this is the identity function.
 */

import "server-only";

export type Locale = "ro" | "en" | "de";

export function loadMessages(
  _locale: Locale,
  _templateKey: string,
): Record<string, string> {
  return {}; // empty — templates use their built-in RO copy
}
