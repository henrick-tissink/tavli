/**
 * Per-segment locale wrapper for the English route tree (audit #17).
 *
 * The App Router permits a single <html> element (the root layout, lang="ro"),
 * so a nested layout cannot re-set the page's <html lang>. Reading the locale
 * in the root layout would require headers() and force the whole app into
 * dynamic rendering, breaking the pricing page's static/ISR generation.
 *
 * Instead we scope the language to this subtree with lang="en" on a
 * display:contents wrapper (no layout/box impact) — WCAG 3.1.2 Language of
 * Parts, so screen readers pronounce the English content correctly.
 */
export default function EnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="en" className="contents">
      {children}
    </div>
  );
}
