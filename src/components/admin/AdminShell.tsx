import type { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";

interface Props {
  userEmail: string | null;
  children: ReactNode;
}

export function AdminShell({ userEmail, children }: Props) {
  return (
    <div className="min-h-screen flex bg-surface-bg">
      <AdminSidebar userEmail={userEmail} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
