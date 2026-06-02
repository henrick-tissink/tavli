import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { organizationMembers, profiles, staffInvitations } from "@/lib/db/schema";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { formatDate } from "@/lib/i18n/format";
import { InviteMemberForm } from "./_components/InviteMemberForm";
import { InvitationRowActions } from "./_components/InvitationRowActions";

export const dynamic = "force-dynamic";

export default async function OrgMembersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.org");
  const roleLabel = (role: string) =>
    (m.roles as Record<string, string>)[role] ?? role;
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
        <h2 className="font-display text-xl text-text-primary">{m.members.title}</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {m.members.subtitle}
        </p>
        <div className="mt-4 overflow-hidden rounded-card border border-border bg-surface-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                <th scope="col" className="px-4 py-3 font-medium">{m.members.colPerson}</th>
                <th scope="col" className="px-4 py-3 font-medium">{m.members.colRole}</th>
                <th scope="col" className="px-4 py-3 font-medium">{m.members.colMemberSince}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">{member.fullName ?? m.members.fallback}</div>
                    <div className="text-xs text-text-muted">{member.email ?? m.members.fallback}</div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{roleLabel(member.role)}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {member.joinedAt ? formatDate(new Date(member.joinedAt), locale, {}) : m.members.fallback}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canInvite && (
        <section>
          <h2 className="font-display text-xl text-text-primary">{m.members.inviteTitle}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {m.members.inviteSubtitle}
          </p>
          <div className="mt-4 rounded-card border border-border bg-surface-white p-5">
            <InviteMemberForm organizationId={orgId} />
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="font-display text-xl text-text-primary">{m.members.pendingTitle}</h2>
          <div className="mt-4 overflow-hidden rounded-card border border-border bg-surface-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">{m.members.colEmail}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{m.members.colRole}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{m.members.colExpires}</th>
                  {canInvite && <th scope="col" className="px-4 py-3 font-medium text-right">{m.members.colActions}</th>}
                </tr>
              </thead>
              <tbody>
                {pending.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-text-primary">{inv.email}</td>
                    <td className="px-4 py-3 text-text-secondary">{roleLabel(inv.role)}</td>
                    <td className="px-4 py-3 text-text-muted">
                      {formatDate(new Date(inv.expiresAt), locale, {})}
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
