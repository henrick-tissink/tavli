import { Store, Clock, FileEdit, Mail } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/db/server";
import { StatCard } from "@/components/admin/StatCard";

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient();

  const [live, pending, draft, invitations] = await Promise.all([
    supabase.from("restaurants").select("id", { count: "exact", head: true }).eq("status", "live"),
    supabase.from("restaurants").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("restaurants").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("invitations").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8 max-w-6xl">
      <header className="mb-8">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Dashboard
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Overview of platform activity.
        </p>
      </header>

      <section className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-4">
        <StatCard
          label="Live restaurants"
          value={live.count ?? 0}
          icon={Store}
          tone="success"
        />
        <StatCard
          label="Pending review"
          value={pending.count ?? 0}
          icon={Clock}
          tone="warning"
        />
        <StatCard
          label="Drafts"
          value={draft.count ?? 0}
          icon={FileEdit}
          tone="muted"
        />
        <StatCard
          label="Open invitations"
          value={invitations.count ?? 0}
          icon={Mail}
        />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-text-primary mb-3">
          Recent activity
        </h2>
        <div className="bg-surface-white rounded-card border border-border p-8 text-center">
          <p className="text-sm text-text-secondary">
            Activity feed arrives with M5 (invitations + email).
          </p>
        </div>
      </section>
    </div>
  );
}
