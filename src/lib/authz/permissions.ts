/**
 * Permission matrix per §01 §4.3. The single source of truth for
 * "which role can perform which action".
 *
 * Cells are `true` (allow) or `false` (deny). `tavli_admin` is NOT in
 * the matrix — it's handled by an early-return shortcut in `can()`
 * (admin passes every check by policy, no matrix lookup needed).
 *
 * §4.3 policy clarification on `staff.role.change`: only `org_owner`
 * may change member roles within an org. `venue_owner` invites and
 * removes venue staff but cannot promote them — they must remove and
 * re-invite. Encoded below by denying `venue_owner` on the row.
 *
 * Adding a new Action requires both:
 *   1. Adding it to the `Action` union below.
 *   2. Adding a row to `PERMISSION_MATRIX` with a cell for every role.
 * The matrix-completeness test enforces the second step.
 */

export type Action =
  // restaurants
  | "restaurant.read"
  | "restaurant.update"
  | "restaurant.delete"
  // staff management
  | "staff.invite.org"
  | "staff.invite.venue"
  | "staff.remove"
  | "staff.role.change"
  // reservations
  | "reservation.create"
  | "reservation.read"
  | "reservation.modify"
  | "reservation.modify.override_capacity"
  | "reservation.cancel"
  | "reservation.mark_no_show"
  // marketing
  | "campaign.create"
  | "campaign.send"
  | "campaign.read"
  | "campaign.delete"
  // billing
  | "billing.read"
  | "billing.update"
  | "subscription.cancel"
  // org
  | "org.read"
  | "org.update"
  | "org.delete"
  | "org.add_venue"
  // table mgmt
  | "table.read"
  | "table.update"
  | "floor_plan.edit"
  // events
  | "event_request.read"
  | "event_request.respond"
  | "event_request.quote"
  // analytics
  | "analytics.read"
  | "analytics.export";

/**
 * Roles that appear in the matrix (excluding tavli_admin, which is
 * handled by the early-return shortcut). These are the roles the
 * MembershipResolver layer maps a session into.
 */
export type MatrixRole =
  | "org_owner"
  | "org_admin"
  | "org_manager"
  | "venue_owner"
  | "venue_manager"
  | "venue_host";

/**
 * Subject of the permission check. Most actions are scoped to a
 * restaurant or organization; a handful are global (Tavli-admin-only).
 */
export type Subject =
  | { kind: "restaurant"; id: string; organization_id: string }
  | { kind: "organization"; id: string }
  | { kind: "reservation"; restaurant_id: string; organization_id?: string }
  | { kind: "campaign"; restaurant_id: string; organization_id?: string }
  | { kind: "staff_invitation"; organization_id?: string; restaurant_id?: string }
  | { kind: "global" };

type MatrixRow = Record<MatrixRole, boolean>;

const ALL_ROLES: readonly MatrixRole[] = [
  "org_owner",
  "org_admin",
  "org_manager",
  "venue_owner",
  "venue_manager",
  "venue_host",
] as const;

/**
 * Convenience for matrix declaration: list the roles that GRANT the
 * action; everything else denies. Reads top-to-bottom with the same
 * shape as the §01 §4.3 table.
 */
function row(...grants: MatrixRole[]): MatrixRow {
  const out: MatrixRow = {
    org_owner: false,
    org_admin: false,
    org_manager: false,
    venue_owner: false,
    venue_manager: false,
    venue_host: false,
  };
  for (const r of grants) out[r] = true;
  return out;
}

export const PERMISSION_MATRIX: Record<Action, MatrixRow> = {
  // restaurants
  "restaurant.read":   row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"),
  "restaurant.update": row("org_owner", "org_admin", "venue_owner"),
  "restaurant.delete": row("org_owner"),

  // staff management
  "staff.invite.org":   row("org_owner", "org_admin"),
  "staff.invite.venue": row("org_owner", "org_admin", "venue_owner"),
  "staff.remove":       row("org_owner", "org_admin", "venue_owner"),
  "staff.role.change":  row("org_owner"), // §4.3 clarification: venue_owner is intentionally excluded

  // reservations
  "reservation.read":                       row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"),
  "reservation.create":                     row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"),
  "reservation.modify":                     row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"),
  "reservation.modify.override_capacity":   row("org_owner", "org_admin", "venue_owner", "venue_manager"),
  "reservation.cancel":                     row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"),
  "reservation.mark_no_show":               row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"),

  // marketing
  "campaign.create": row("org_owner", "org_admin", "venue_owner"),
  "campaign.send":   row("org_owner", "org_admin", "venue_owner"),
  "campaign.read":   row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"),
  "campaign.delete": row("org_owner"),

  // billing
  "billing.read":        row("org_owner", "org_admin"),
  "billing.update":      row("org_owner"),
  "subscription.cancel": row("org_owner"),

  // org
  "org.read":      row("org_owner", "org_admin", "org_manager"),
  "org.update":    row("org_owner", "org_admin"),
  "org.delete":    row("org_owner"),
  "org.add_venue": row("org_owner", "org_admin"),

  // table mgmt
  "table.read":      row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"),
  "table.update":    row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"),
  "floor_plan.edit": row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"),

  // events
  "event_request.read":    row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"),
  "event_request.respond": row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"),
  "event_request.quote":   row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"),

  // analytics
  "analytics.read":   row("org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"),
  "analytics.export": row("org_owner", "org_admin", "venue_owner"),
};

export { ALL_ROLES };
