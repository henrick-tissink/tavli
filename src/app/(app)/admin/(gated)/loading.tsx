import { Skeleton } from "@/components/skeleton";

/** Admin screens are table-shaped, so the skeleton is a header plus rows. */
export default function AdminLoading() {
  return (
    <div aria-busy="true" className="p-6 space-y-6">
      <Skeleton className="h-7 w-48" tone="border" />
      <div className="space-y-2">
        <Skeleton className="h-10" rounded="card" tone="border" />
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12" rounded="card" tone="border" />
        ))}
      </div>
    </div>
  );
}
