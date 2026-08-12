import { Skeleton } from "@/components/skeleton";

/**
 * The storefront's highest-traffic boundary. The shell layout itself queries
 * restaurants on every navigation, so without this a tab switch or card tap
 * leaves the previous screen frozen for the whole round-trip.
 */
export default function CityShellLoading() {
  return (
    <div aria-busy="true" className="px-4 py-4 space-y-4">
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0" rounded="pill" tone="border" />
        ))}
      </div>
      <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-44 w-full" rounded="card" tone="border" />
            <Skeleton className="h-5 w-2/3" tone="border" />
            <Skeleton className="h-4 w-1/2" tone="border" />
          </div>
        ))}
      </div>
    </div>
  );
}
