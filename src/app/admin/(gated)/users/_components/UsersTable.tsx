import Link from "next/link";
import { ImpersonateModal } from "./ImpersonateModal";

export interface UserRow {
  id: string;
  email: string;
  role: string;
  lastSignInAt: string | null;
  hasMfa: boolean;
  lastImpersonatedAt: string | null;
}

function relative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function UsersTable({
  users,
  selectedId,
}: {
  users: UserRow[];
  selectedId?: string;
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-left text-sm text-text-muted border-b border-border">
          <th className="py-2 pr-4">Email</th>
          <th className="py-2 pr-4">Role</th>
          <th className="py-2 pr-4">MFA</th>
          <th className="py-2 pr-4">Last sign-in</th>
          <th className="py-2 pr-4">Last imp.</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr
            key={u.id}
            className={`border-b border-border hover:bg-surface-bg ${
              selectedId === u.id ? "bg-surface-bg" : ""
            }`}
          >
            <td className="py-2 pr-4">
              <Link
                href={{ query: { selected: u.id } }}
                className="hover:underline"
              >
                {u.email}
              </Link>
            </td>
            <td className="py-2 pr-4">{u.role}</td>
            <td className="py-2 pr-4">{u.hasMfa ? "✓" : "—"}</td>
            <td className="py-2 pr-4">{relative(u.lastSignInAt)}</td>
            <td className="py-2 pr-4">{relative(u.lastImpersonatedAt)}</td>
            <td className="py-2">
              <ImpersonateModal targetUserId={u.id} targetEmail={u.email} />
            </td>
          </tr>
        ))}
        {users.length === 0 && (
          <tr>
            <td colSpan={6} className="py-4 text-center text-text-muted">
              No users found.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
