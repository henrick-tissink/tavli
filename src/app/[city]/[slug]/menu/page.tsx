import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMenu, getRestaurantDetail } from "@/lib/repos/restaurants-repo";
import { MenuViewer } from "@/components/menu-viewer";
import { formatCuisines, PRICE_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DinerMenuPage({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}) {
  const { city, slug } = await params;
  const [detail, menu] = await Promise.all([
    getRestaurantDetail(slug),
    getMenu(slug),
  ]);

  if (!detail) notFound();

  const hasMenu = !!menu && menu.sections.length > 0 && menu.items.length > 0;

  return (
    <div className="min-h-screen bg-surface-bg px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <span
          data-testid="tavli-wordmark"
          className="font-display text-xl font-bold text-brand-primary tracking-tight"
        >
          Tavli
        </span>

        <header className="mt-8 text-center">
          <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
            {detail.name}
          </h1>
          <p className="text-sm text-text-muted mt-2">
            {formatCuisines(detail.cuisines)} · {PRICE_LABELS[detail.priceLevel]}
          </p>
        </header>

        <div className="mt-8">
          {hasMenu ? (
            <MenuViewer menu={menu!} />
          ) : (
            <div className="rounded-card border border-border bg-surface-white p-8 text-center">
              <p className="font-display text-xl font-bold text-text-primary">
                Menu coming soon
              </p>
              <p className="text-sm text-text-secondary mt-2">
                Please ask your server for a printed copy.
              </p>
            </div>
          )}
        </div>

        <footer className="mt-12 text-center text-xs text-text-muted">
          powered by{" "}
          <Link
            href={`/${city}/${slug}`}
            className="text-brand-primary hover:underline"
          >
            tavli.ro
          </Link>
        </footer>
      </div>
    </div>
  );
}
