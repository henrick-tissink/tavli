"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { removeVenueFromOrgAction, reactivateVenueAction } from "../../venues/actions";

export function VenueRowActions({
  organizationId,
  restaurantId,
  archived,
}: {
  organizationId: string;
  restaurantId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function deactivate() {
    const reason = window.prompt("Motivul dezactivării (opțional):") ?? "";
    startTransition(async () => {
      const res = await removeVenueFromOrgAction({ organizationId, restaurantId, reason });
      if (res.ok) {
        toast.success("Locație dezactivată.");
        router.refresh();
      } else {
        toast.error(
          res.error.includes("TV703")
            ? "Locația are rezervări viitoare. Anulează-le sau așteaptă să treacă."
            : "Dezactivarea nu a reușit.",
        );
      }
    });
  }

  function reactivate() {
    startTransition(async () => {
      const res = await reactivateVenueAction({ organizationId, restaurantId });
      if (res.ok) {
        toast.success("Locație reactivată.");
        router.refresh();
      } else {
        toast.error(
          res.error.includes("TV701")
            ? "Reactivarea necesită planul Pro."
            : res.error.includes("TV702")
              ? "Ai atins limita de locații a planului."
              : "Reactivarea nu a reușit.",
        );
      }
    });
  }

  return archived ? (
    <button
      type="button"
      onClick={reactivate}
      disabled={pending}
      className="min-h-[36px] rounded-button border border-border px-3 py-1.5 text-xs font-semibold text-text-primary hover:bg-surface-bg disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
    >
      Reactivează
    </button>
  ) : (
    <button
      type="button"
      onClick={deactivate}
      disabled={pending}
      className="min-h-[36px] rounded-button px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-error disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
    >
      Dezactivează
    </button>
  );
}
