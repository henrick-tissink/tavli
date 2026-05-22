import { createSupabaseAdminClient, dbAdmin } from "@/lib/db/admin";
import { sql } from "drizzle-orm";
import { UsersTable, type UserRow } from "./_components/UsersTable";
import {
  UserDrawer,
  type AuditEvent,
  type DrawerUser,
} from "./_components/UserDrawer";

export const dynamic = "force-dynamic";

async function fetchUsers(q: string | undefined): Promise<UserRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data: usersResp } = await supabase.auth.admin.listUsers({
    perPage: 200,
  });
  const profileRows = await dbAdmin.execute(sql`
    SELECT id, role, created_at FROM profiles
  `);
  const profilesById = new Map(
    (profileRows as unknown as Array<{
      id: string;
      role: string;
      created_at: string;
    }>).map((p) => [p.id, p]),
  );
  const impersonationRows = await dbAdmin.execute(sql`
    SELECT DISTINCT ON (subject_id) subject_id, created_at
    FROM audit_logs
    WHERE action = 'user.impersonation_started'
    ORDER BY subject_id, created_at DESC
  `);
  const lastImpById = new Map(
    (impersonationRows as unknown as Array<{
      subject_id: string;
      created_at: string;
    }>).map((r) => [r.subject_id, r.created_at]),
  );

  const ql = q?.toLowerCase();
  return (usersResp?.users ?? [])
    .filter((u) => !ql || (u.email ?? "").toLowerCase().includes(ql))
    .map((u) => {
      const profile = profilesById.get(u.id);
      // Supabase admin's listUsers includes factors on each user. Filter for verified TOTP.
      const factors = (u as { factors?: Array<{ status: string; factor_type: string }> })
        .factors;
      const hasMfa =
        Array.isArray(factors) &&
        factors.some((f) => f.status === "verified" && f.factor_type === "totp");
      return {
        id: u.id,
        email: u.email ?? "—",
        role: profile?.role ?? "—",
        lastSignInAt: u.last_sign_in_at ?? null,
        hasMfa,
        lastImpersonatedAt: lastImpById.get(u.id) ?? null,
      };
    })
    .slice(0, 100);
}

async function fetchUserDetail(
  userId: string,
): Promise<{ events: AuditEvent[] } | null> {
  const supabase = createSupabaseAdminClient();
  const { data: userResp } = await supabase.auth.admin.getUserById(userId);
  if (!userResp?.user) return null;

  const events = await dbAdmin.execute(sql`
    SELECT id, action, actor_user_id, impersonator_user_id, subject_id, context, created_at
    FROM audit_logs
    WHERE subject_id = ${userId} OR actor_user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 50
  `);
  return { events: events as unknown as AuditEvent[] };
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; selected?: string }>;
}) {
  const params = await searchParams;
  const users = await fetchUsers(params.q);

  let drawerUser: DrawerUser | null = null;
  let events: AuditEvent[] = [];
  if (params.selected) {
    const detail = await fetchUserDetail(params.selected);
    const u = users.find((row) => row.id === params.selected);
    if (detail && u) {
      drawerUser = {
        id: u.id,
        email: u.email,
        role: u.role,
        createdAt: u.lastSignInAt ?? "",
      };
      events = detail.events;
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 p-6 space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Users</h1>
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search by email…"
              className="rounded-button border border-border px-3 py-2"
            />
            <button
              type="submit"
              className="rounded-button border border-border px-4 py-2 text-sm font-medium hover:bg-surface-bg"
            >
              Search
            </button>
          </form>
        </header>
        <UsersTable users={users} selectedId={params.selected} />
      </div>
      {drawerUser && (
        <UserDrawer user={drawerUser} events={events} />
      )}
    </div>
  );
}
