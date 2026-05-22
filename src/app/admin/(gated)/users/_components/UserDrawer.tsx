import Link from "next/link";
import { ImpersonateModal } from "./ImpersonateModal";

export interface DrawerUser {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  actor_user_id: string | null;
  impersonator_user_id: string | null;
  subject_id: string | null;
  context: unknown;
  created_at: string;
}

export function UserDrawer({
  user,
  events,
}: {
  user: DrawerUser;
  events: AuditEvent[];
}) {
  return (
    <aside className="w-96 border-l border-border p-6 space-y-4 overflow-y-auto">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{user.email}</h2>
          <p className="text-sm text-text-muted">{user.role}</p>
        </div>
        <Link
          href={{ query: {} }}
          aria-label="Close"
          className="text-text-muted hover:text-text-primary"
        >
          ×
        </Link>
      </header>

      <div>
        <ImpersonateModal targetUserId={user.id} targetEmail={user.email} />
      </div>

      <section>
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mt-6 mb-2">
          Audit timeline (last 50)
        </h3>
        <ol className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="text-sm border-l-2 border-border pl-3">
              <div className="font-mono text-xs text-text-muted">
                {new Date(e.created_at).toLocaleString()}
              </div>
              <div className="font-medium">{e.action}</div>
              {e.impersonator_user_id && (
                <div className="text-xs text-amber-700">
                  impersonated by {e.impersonator_user_id}
                </div>
              )}
            </li>
          ))}
          {events.length === 0 && (
            <li className="text-sm text-text-muted">No events.</li>
          )}
        </ol>
      </section>
    </aside>
  );
}
