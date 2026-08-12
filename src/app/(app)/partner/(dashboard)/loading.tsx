import { Skeleton } from "@/components/skeleton";

/**
 * Covers all 28 dashboard children. Beyond showing progress, its presence is
 * what lets Next partially prefetch these `force-dynamic` routes — without a
 * loading boundary, prefetch is skipped entirely and a sidebar click sits on
 * the old page until the server responds.
 *
 * No text: loading UI must not await a locale lookup, and an untranslated
 * string is worse than none. `aria-busy` carries the state instead.
 */
export default function PartnerDashboardLoading() {
  return (
    <div aria-busy="true" className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" tone="border" />
        <Skeleton className="h-4 w-80" tone="border" />
      </div>
      <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" rounded="card" tone="border" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" rounded="card" tone="border" />
        ))}
      </div>
    </div>
  );
}
