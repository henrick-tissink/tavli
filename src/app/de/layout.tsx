/**
 * Per-segment locale wrapper for the German route tree (audit #17).
 * See src/app/en/layout.tsx for the rationale (single <html> in App Router →
 * scope the language to the subtree via lang on a display:contents wrapper).
 */
export default function DeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="de" className="contents">
      {children}
    </div>
  );
}
