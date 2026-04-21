import { createSupabaseServerClient } from "@/lib/db/server";
import { InvitationForm } from "@/components/admin/InvitationForm";
import { InvitationRow } from "@/components/admin/InvitationRow";

export const dynamic = "force-dynamic";

export default async function AdminInvitationsPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: cities }, { data: invitations, error }] = await Promise.all([
    supabase.from("cities").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("invitations")
      .select(
        "id, email, proposed_name, status, expires_at, created_at, cities(name)",
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          Invitations
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Invite restaurants to onboard on Tavli. They&apos;ll get an email link
          that opens their onboarding wizard.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="font-display text-xl font-bold text-text-primary mb-3">
          New invitation
        </h2>
        <InvitationForm cities={cities ?? []} />
      </section>

      <section>
        <h2 className="font-display text-xl font-bold text-text-primary mb-3">
          Sent
        </h2>

        {error && (
          <div className="bg-red-50 text-red-900 border border-red-200 rounded-card p-4 text-sm mb-4">
            Could not load invitations: {error.message}
          </div>
        )}

        <div className="bg-surface-white rounded-card border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-surface-bg">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold text-text-secondary">Email</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Restaurant</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">City</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Status</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Expires</th>
                <th className="px-4 py-3 font-semibold text-text-secondary text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(invitations ?? []).map((i) => {
                const cityName = Array.isArray(i.cities)
                  ? i.cities[0]?.name
                  : (i.cities as { name: string } | null)?.name ?? null;
                return (
                  <InvitationRow
                    key={i.id}
                    id={i.id}
                    email={i.email}
                    cityName={cityName ?? null}
                    proposedName={i.proposed_name}
                    status={i.status}
                    expiresAt={i.expires_at}
                    createdAt={i.created_at}
                  />
                );
              })}
              {(!invitations || invitations.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-text-muted">
                    No invitations yet. Send one above to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
