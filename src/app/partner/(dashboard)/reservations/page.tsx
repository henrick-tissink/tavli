import { ComingSoon } from "@/components/partner/ComingSoon";

export const dynamic = "force-dynamic";

export default function PartnerReservationsPage() {
  return (
    <ComingSoon
      title="Reservations"
      milestone="M11–M13"
      description="Configure availability (covers per time slot), see today / upcoming / past reservations, mark seated / no-show / cancelled."
    />
  );
}
