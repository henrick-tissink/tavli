import type { ReactNode } from "react";
import { PartnerSidebar } from "./PartnerSidebar";

interface Props {
  restaurantName: string | null;
  userEmail: string | null;
  children: ReactNode;
}

export function PartnerShell({ restaurantName, userEmail, children }: Props) {
  return (
    <div className="min-h-screen desktop:flex bg-surface-bg">
      <PartnerSidebar restaurantName={restaurantName} userEmail={userEmail} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
