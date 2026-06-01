import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { organizationMembers, profiles, staffInvitations } from "@/lib/db/schema";
import { InviteMemberForm } from "./_components/InviteMemberForm";
import { InvitationRowActions } from "./_components/InvitationRowActions";

export const dynamic = "force-dynamic";

const ROLE_RO: Record<string, string> = {
  owner: "Proprietar",
  admin: "Administrator",
  manager: "Manager",
  host: "Gazdă",
};

export default async function OrgMembersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  // The layout already enforces org.read; this page additionally surfaces the
  // invite controls only to those who can invite.
  const canInvite = await can(session, "staff.invite.org", { kind: "organization", id: orgId });

  const members = await dbAdmin
    .select({
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      joinedAt: organizationMembers.joinedAt,
      email: profiles.email,
      fullName: profiles.fullName,
    })
    .from(organizationMembers)
    .leftJoin(profiles, eq(profiles.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.isActive, true)))
    .orderBy(desc(organizationMembers.joinedAt));

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
        eq(staffInvitations.organizationId, orgId),
        eq(staffInvitations.kind, "org"),
        eq(staffInvitations.status, "pending"),
      ),
    )
    .orderBy(desc(staffInvitations.createdAt));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-xl text-text-primary">Membrii organizației</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Persoanele cu acces la nivel de organizație și la toate locațiile.
        </p>
        <div className="mt-4 overflow-hidden rounded-card border border-border bg-surface-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                <th scope="col" className="px-4 py-3 font-medium">Persoană</th>
                <th scope="col" className="px-4 py-3 font-medium">Rol</th>
                <th scope="col" className="px-4 py-3 font-medium">Membru din</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">{m.fullName ?? "—"}</div>
                    <div className="text-xs text-text-muted">{m.email ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{ROLE_RO[m.role] ?? m.role}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString("ro-RO") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canInvite && (
        <section>
          <h2 className="font-display text-xl text-text-primary">Invită un membru</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Trimite o invitație prin email. Linkul expiră în 14 zile.
          </p>
          <div className="mt-4 rounded-card border border-border bg-surface-white p-5">
            <InviteMemberForm organizationId={orgId} />
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
                          <InvitationRowActions organizationId={orgId} invitationId={inv.id} />
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
  );
}
