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

export interface OrgMembership {
  org_id: string;
  org_name: string;
  role: string;
  is_active: boolean;
  joined_at: string;
}

export interface RestaurantStaffEntry {
  restaurant_id: string;
  restaurant_name: string;
  role: string;
  is_active: boolean;
  joined_at: string;
}

export interface MfaFactor {
  id: string;
  friendlyName: string | null;
  createdAt: string;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        active
          ? "bg-success/10 text-success"
          : "bg-surface-bg text-text-muted"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function UserDrawer({
  user,
  events,
  orgMemberships,
  restaurantStaff,
  mfaFactors,
}: {
  user: DrawerUser;
  events: AuditEvent[];
  orgMemberships: OrgMembership[];
  restaurantStaff: RestaurantStaffEntry[];
  mfaFactors: MfaFactor[];
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
          Org memberships
        </h3>
        <ol className="space-y-2">
          {orgMemberships.map((m) => (
            <li
              key={m.org_id}
              className="text-sm border-l-2 border-border pl-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium truncate">{m.org_name}</div>
                <StatusPill active={m.is_active} />
              </div>
              <div className="text-xs text-text-muted">
                {m.role} · joined {formatDate(m.joined_at)}
              </div>
            </li>
          ))}
          {orgMemberships.length === 0 && (
            <li className="text-sm text-text-muted">
              Not a member of any organization.
            </li>
          )}
        </ol>
      </section>

      <section>
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mt-6 mb-2">
          Restaurant staff
        </h3>
        <ol className="space-y-2">
          {restaurantStaff.map((s) => (
            <li
              key={s.restaurant_id}
              className="text-sm border-l-2 border-border pl-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium truncate">{s.restaurant_name}</div>
                <StatusPill active={s.is_active} />
              </div>
              <div className="text-xs text-text-muted">
                {s.role} · joined {formatDate(s.joined_at)}
              </div>
            </li>
          ))}
          {restaurantStaff.length === 0 && (
            <li className="text-sm text-text-muted">
              Not assigned to any restaurant.
            </li>
          )}
        </ol>
      </section>

      <section>
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mt-6 mb-2">
          MFA factors
        </h3>
        <ol className="space-y-2">
          {mfaFactors.map((f) => (
            <li key={f.id} className="text-sm border-l-2 border-border pl-3">
              <div className="font-medium">
                {f.friendlyName ?? "Authenticator"}
              </div>
              <div className="text-xs text-text-muted">
                TOTP · enrolled {formatDate(f.createdAt)}
              </div>
            </li>
          ))}
          {mfaFactors.length === 0 && (
            <li className="text-sm text-text-muted">No MFA factor enrolled.</li>
          )}
        </ol>
      </section>

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
