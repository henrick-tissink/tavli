import { Skeleton } from "@/components/skeleton";

/** Onboarding is a single centred form column at every step. */
export default function OnboardLoading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-lg p-6 space-y-4">
      <Skeleton className="h-7 w-2/3" tone="border" />
      <Skeleton className="h-4 w-full" tone="border" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" tone="border" />
      ))}
      <Skeleton className="h-11 w-40" tone="border" />
    </div>
  );
}
