import type { ReactNode } from "react";
import Link from "next/link";

export default function LegalLayout({ children }: { children: ReactNode }) {
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="min-h-screen bg-surface-bg">
      {isDev && (
        <div className="sticky top-0 z-50 bg-brand-primary text-white text-center text-xs font-bold py-1.5 px-4">
          ⚠ REVIEW BEFORE LAUNCH — these documents are templates, not legal advice. Have a Romanian lawyer review before any marketing push.
        </div>
      )}
      <article className="max-w-3xl mx-auto px-6 py-12 prose prose-neutral prose-headings:font-display prose-headings:font-bold prose-h1:text-4xl prose-h1:tracking-tight prose-h1:mb-2 prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-3 prose-p:leading-relaxed prose-p:text-text-primary prose-a:text-brand-primary prose-a:no-underline hover:prose-a:underline">
        {children}
        <hr className="my-12 border-border" />
        <p className="text-sm text-text-muted">
          <Link href="/">← Înapoi la Tavli</Link>
        </p>
      </article>
    </div>
  );
}
