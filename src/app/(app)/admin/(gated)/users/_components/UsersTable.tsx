import Link from "next/link";
import { translate } from "@/lib/i18n/t";
import { type Locale } from "@/lib/i18n/locale";
import { type AdminUsersMessages } from "@/lib/i18n/messages";
import { ImpersonateModal } from "./ImpersonateModal";

export interface UserRow {
  id: string;
  email: string;
  role: string;
  lastSignInAt: string | null;
  hasMfa: boolean;
  lastImpersonatedAt: string | null;
}

function relative(
  iso: string | null,
  locale: Locale,
  msgs: AdminUsersMessages,
): string {
  if (!iso) return msgs.table.empty;
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return translate(locale, msgs.table.minAgo, { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return translate(locale, msgs.table.hoursAgo, { count: h });
  return translate(locale, msgs.table.daysAgo, { count: Math.floor(h / 24) });
}

export function UsersTable({
  users,
  selectedId,
  locale,
  msgs,
}: {
  users: UserRow[];
  selectedId?: string;
  locale: Locale;
  msgs: AdminUsersMessages;
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-left text-sm text-text-muted border-b border-border">
          <th className="py-2 pr-4">{msgs.table.email}</th>
          <th className="py-2 pr-4">{msgs.table.role}</th>
          <th className="py-2 pr-4">{msgs.table.mfa}</th>
          <th className="py-2 pr-4">{msgs.table.lastSignIn}</th>
          <th className="py-2 pr-4">{msgs.table.lastImpersonated}</th>
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
            <td className="py-2 pr-4">{u.hasMfa ? "✓" : msgs.table.empty}</td>
            <td className="py-2 pr-4">{relative(u.lastSignInAt, locale, msgs)}</td>
            <td className="py-2 pr-4">
              {relative(u.lastImpersonatedAt, locale, msgs)}
            </td>
            <td className="py-2">
              <ImpersonateModal targetUserId={u.id} targetEmail={u.email} />
            </td>
          </tr>
        ))}
        {users.length === 0 && (
          <tr>
            <td colSpan={6} className="py-4 text-center text-text-muted">
              {msgs.table.noUsers}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
