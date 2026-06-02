"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { useT } from "@/lib/i18n/messages-provider";
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
  const t = useT("partner.org");
  const [pending, startTransition] = useTransition();

  function deactivate() {
    const reason = window.prompt(t("venues.deactivatePrompt")) ?? "";
    startTransition(async () => {
      const res = await removeVenueFromOrgAction({ organizationId, restaurantId, reason });
      if (res.ok) {
        toast.success(t("venues.toastDeactivated"));
        router.refresh();
      } else {
        toast.error(
          res.error.includes("TV703")
            ? t("venues.errorFutureReservations")
            : t("venues.errorDeactivateFailed"),
        );
      }
    });
  }

  function reactivate() {
    startTransition(async () => {
      const res = await reactivateVenueAction({ organizationId, restaurantId });
      if (res.ok) {
        toast.success(t("venues.toastReactivated"));
        router.refresh();
      } else {
        toast.error(
          res.error.includes("TV701")
            ? t("venues.errorReactivateProRequired")
            : res.error.includes("TV702")
              ? t("venues.errorReactivateLimit")
              : t("venues.errorReactivateFailed"),
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
      {t("venues.reactivate")}
    </button>
  ) : (
    <button
      type="button"
      onClick={deactivate}
      disabled={pending}
      className="min-h-[36px] rounded-button px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-error disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
    >
      {t("venues.deactivate")}
    </button>
  );
}
