import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, restaurantStaff, profiles, staffInvitations } from "@/lib/db/schema";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { InviteStaffForm } from "./_components/InviteStaffForm";
import { StaffInvitationRowActions } from "./_components/StaffInvitationRowActions";

export const dynamic = "force-dynamic";

const ROLE_RO: Record<string, string> = {
  owner: "Proprietar",
  manager: "Manager",
  host: "Gazdă",
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <div className="rounded-card border border-border bg-surface-white p-10 text-center">
        <p className="font-semibold text-text-primary">{message}</p>
      </div>
    </div>
  );
}

export default async function StaffPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) {
    return <EmptyState message="Niciun restaurant asociat acestui cont." />;
  }

  const [venue] = await dbAdmin
    .select({ id: restaurants.id, name: restaurants.name, organizationId: restaurants.organizationId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!venue) redirect("/partner");

  // organizationId may be null on dev DBs predating the org-ownership migration;
  // fall back to "" for the can() subject (prod carries the real value).
  const organizationId = venue.organizationId ?? "";
  const canInvite = await can(session, "staff.invite.venue", {
    kind: "restaurant",
    id: venue.id,
    organization_id: organizationId,
  });

  const staff = await dbAdmin
    .select({
      userId: restaurantStaff.userId,
      role: restaurantStaff.role,
      joinedAt: restaurantStaff.joinedAt,
      email: profiles.email,
      fullName: profiles.fullName,
    })
    .from(restaurantStaff)
    .leftJoin(profiles, eq(profiles.id, restaurantStaff.userId))
    .where(and(eq(restaurantStaff.restaurantId, venue.id), eq(restaurantStaff.isActive, true)))
    .orderBy(desc(restaurantStaff.joinedAt));

  const pending = await dbAdmin
    .select({
      id: staffInvitations.id,
      email: staffInvitations.email,
      role: staffInvitations.role,
      expiresAt: staffInvitations.expiresAt,
    })
    .from(staffInvitations)
    .where(
      and(
        eq(staffInvitations.restaurantId, venue.id),
        eq(staffInvitations.kind, "restaurant"),
        eq(staffInvitations.status, "pending"),
      ),
    )
    .orderBy(desc(staffInvitations.createdAt));

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-text-primary">Echipa</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Personalul cu acces la <strong className="text-text-primary">{venue.name}</strong>.
        </p>
      </header>

      <div className="space-y-8">
        <section>
          <h2 className="font-display text-xl text-text-primary">Personal activ</h2>
          <div className="mt-4 overflow-hidden rounded-card border border-border bg-surface-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Persoană</th>
                  <th scope="col" className="px-4 py-3 font-medium">Rol</th>
                  <th scope="col" className="px-4 py-3 font-medium">Din</th>
                </tr>
              </thead>
              <tbody>
                {staff.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-sm text-text-muted">
                      Niciun membru încă.
                    </td>
                  </tr>
                ) : (
                  staff.map((s) => (
                    <tr key={s.userId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{s.fullName ?? "—"}</div>
                        <div className="text-xs text-text-muted">{s.email ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{ROLE_RO[s.role] ?? s.role}</td>
                      <td className="px-4 py-3 text-text-muted">
                        {s.joinedAt ? new Date(s.joinedAt).toLocaleDateString("ro-RO") : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {canInvite && (
          <section>
            <h2 className="font-display text-xl text-text-primary">Invită personal</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Trimite o invitație prin email. Linkul expiră în 14 zile.
            </p>
            <div className="mt-4 rounded-card border border-border bg-surface-white p-5">
              <InviteStaffForm restaurantId={venue.id} organizationId={organizationId} />
            </div>
          </section>
        )}

        {pending.length > 0 && (
          <section>
            <h2 className="font-display text-xl text-text-primary">Invitații în așteptare</h2>
            <div className="mt-4 overflow-hidden rounded-card border border-border bg-surface-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                    <th scope="col" className="px-4 py-3 font-medium">Email</th>
                    <th scope="col" className="px-4 py-3 font-medium">Rol</th>
                    <th scope="col" className="px-4 py-3 font-medium">Expiră</th>
                    {canInvite && <th scope="col" className="px-4 py-3 font-medium text-right">Acțiuni</th>}
                  </tr>
                </thead>
                <tbody>
                  {pending.map((inv) => (
                    <tr key={inv.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-text-primary">{inv.email}</td>
                      <td className="px-4 py-3 text-text-secondary">{ROLE_RO[inv.role] ?? inv.role}</td>
                      <td className="px-4 py-3 text-text-muted">
                        {new Date(inv.expiresAt).toLocaleDateString("ro-RO")}
                      </td>
                      {canInvite && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <StaffInvitationRowActions invitationId={inv.id} />
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
