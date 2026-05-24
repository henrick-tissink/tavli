import type { ReactNode } from "react";
import { PartnerSidebar } from "./PartnerSidebar";
import { PartnerNotificationBell } from "./PartnerNotificationBell";

interface Props {
  restaurantName: string | null;
  userEmail: string | null;
  openEventRequestsCount?: number;
  venues?: { id: string; name: string }[];
  activeVenueId?: string | null;
  children: ReactNode;
}

export function PartnerShell({
  restaurantName,
  userEmail,
  openEventRequestsCount = 0,
  venues = [],
  activeVenueId = null,
  children,
}: Props) {
  return (
    <div className="min-h-screen desktop:flex bg-surface-bg">
      <PartnerSidebar
        restaurantName={restaurantName}
        userEmail={userEmail}
        openEventRequestsCount={openEventRequestsCount}
        venues={venues}
        activeVenueId={activeVenueId}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="hidden desktop:flex sticky top-0 z-20 h-12 items-center justify-end gap-2 bg-surface-white border-b border-border px-6">
          <PartnerNotificationBell />
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
