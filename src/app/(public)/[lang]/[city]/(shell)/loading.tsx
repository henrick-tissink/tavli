import { Skeleton } from "@/components/skeleton";

/**
 * The storefront's highest-traffic boundary. The shell layout itself queries
 * restaurants on every navigation, so without this a tab switch or card tap
 * leaves the previous screen frozen for the whole round-trip.
 *
 * Shaped to match the feed, which is the page behind this boundary that gets
 * the most traffic: a full-bleed hero (measured at 1280x520 on desktop), then
 * a two-column section, then a three-column one. Getting this wrong is worse
 * than a plain spinner — a skeleton that does not match makes content visibly
 * jump when it arrives.
 *
 * Sibling segments (map, saved, a venue page) inherit this and are shaped
 * differently; a generic placeholder is the accepted trade for one boundary.
 *
 * No text: loading UI must not await a locale lookup, and an untranslated
 * string is worse than none. `aria-busy` carries the state instead.
 */
export default function CityShellLoading() {
  return (
    <div aria-busy="true">
      {/* Hero — full-bleed, matching the feed's lead image. */}
      <Skeleton className="h-64 w-full tablet:h-80 desktop:h-[520px]" rounded="card" tone="border" />

      <div className="px-4 py-6 space-y-8">
        {/* Filter pills */}
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 shrink-0" rounded="pill" tone="border" />
          ))}
        </div>

        {/* Two-column section */}
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" tone="border" />
          <div className="grid gap-4 tablet:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-48 w-full" rounded="card" tone="border" />
                <Skeleton className="h-5 w-2/3" tone="border" />
                <Skeleton className="h-4 w-1/2" tone="border" />
              </div>
            ))}
          </div>
        </div>

        {/* Three-column section */}
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" tone="border" />
          <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-40 w-full" rounded="card" tone="border" />
                <Skeleton className="h-5 w-2/3" tone="border" />
                <Skeleton className="h-4 w-1/2" tone="border" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
