import Link from "next/link";
import { interpolate } from "@/lib/i18n/t";
import { formatDate } from "@/lib/i18n/format";
import { type Locale } from "@/lib/i18n/locale";
import { type AdminUsersMessages } from "@/lib/i18n/messages";
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

function StatusPill({
  active,
  msgs,
}: {
  active: boolean;
  msgs: AdminUsersMessages;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        active
          ? "bg-success/10 text-success"
          : "bg-surface-bg text-text-muted"
      }`}
    >
      {active ? msgs.drawer.statusActive : msgs.drawer.statusInactive}
    </span>
  );
}

export function UserDrawer({
  user,
  events,
  orgMemberships,
  restaurantStaff,
  mfaFactors,
  locale,
  msgs,
}: {
  user: DrawerUser;
  events: AuditEvent[];
  orgMemberships: OrgMembership[];
  restaurantStaff: RestaurantStaffEntry[];
  mfaFactors: MfaFactor[];
  locale: Locale;
  msgs: AdminUsersMessages;
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
          aria-label={msgs.drawer.close}
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
          {msgs.drawer.orgMembershipsHeading}
        </h3>
        <ol className="space-y-2">
          {orgMemberships.map((m) => (
            <li
              key={m.org_id}
              className="text-sm border-l-2 border-border pl-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium truncate">{m.org_name}</div>
                <StatusPill active={m.is_active} msgs={msgs} />
              </div>
              <div className="text-xs text-text-muted">
                {interpolate(msgs.drawer.orgMembershipMeta, {
                  role: m.role,
                  date: formatDate(new Date(m.joined_at), locale),
                })}
              </div>
            </li>
          ))}
          {orgMemberships.length === 0 && (
            <li className="text-sm text-text-muted">
              {msgs.drawer.orgMembershipsEmpty}
            </li>
          )}
        </ol>
      </section>

      <section>
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mt-6 mb-2">
          {msgs.drawer.restaurantStaffHeading}
        </h3>
        <ol className="space-y-2">
          {restaurantStaff.map((s) => (
            <li
              key={s.restaurant_id}
              className="text-sm border-l-2 border-border pl-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium truncate">{s.restaurant_name}</div>
                <StatusPill active={s.is_active} msgs={msgs} />
              </div>
              <div className="text-xs text-text-muted">
                {interpolate(msgs.drawer.restaurantStaffMeta, {
                  role: s.role,
                  date: formatDate(new Date(s.joined_at), locale),
                })}
              </div>
            </li>
          ))}
          {restaurantStaff.length === 0 && (
            <li className="text-sm text-text-muted">
              {msgs.drawer.restaurantStaffEmpty}
            </li>
          )}
        </ol>
      </section>

      <section>
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mt-6 mb-2">
          {msgs.drawer.mfaFactorsHeading}
        </h3>
        <ol className="space-y-2">
          {mfaFactors.map((f) => (
            <li key={f.id} className="text-sm border-l-2 border-border pl-3">
              <div className="font-medium">
                {f.friendlyName ?? msgs.drawer.authenticatorFallback}
              </div>
              <div className="text-xs text-text-muted">
                {interpolate(msgs.drawer.mfaFactorMeta, {
                  date: formatDate(new Date(f.createdAt), locale),
                })}
              </div>
            </li>
          ))}
          {mfaFactors.length === 0 && (
            <li className="text-sm text-text-muted">
              {msgs.drawer.mfaFactorsEmpty}
            </li>
          )}
        </ol>
      </section>

      <section>
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mt-6 mb-2">
          {msgs.drawer.auditHeading}
        </h3>
        <ol className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="text-sm border-l-2 border-border pl-3">
              <div className="font-mono text-xs text-text-muted">
                {formatDate(new Date(e.created_at), locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </div>
              <div className="font-medium">{e.action}</div>
              {e.impersonator_user_id && (
                <div className="text-xs text-amber-700">
                  {interpolate(msgs.drawer.impersonatedBy, {
                    id: e.impersonator_user_id,
                  })}
                </div>
              )}
            </li>
          ))}
          {events.length === 0 && (
            <li className="text-sm text-text-muted">{msgs.drawer.auditEmpty}</li>
          )}
        </ol>
      </section>
    </aside>
  );
}
