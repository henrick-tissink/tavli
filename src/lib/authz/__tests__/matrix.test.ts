/**
 * @jest-environment node
 *
 * Pins every cell of the §01 §4.3 permission matrix. A spec change
 * means updating both the matrix file AND this table — drift is
 * surfaced loudly rather than absorbed silently.
 */

import {
  ALL_ROLES,
  PERMISSION_MATRIX,
  type Action,
  type MatrixRole,
} from "../permissions";

/**
 * Mirror of §01 §4.3, top-to-bottom. Each row: action + the explicit
 * list of roles that GRANT it. Tests assert ALL other roles deny.
 */
const SPEC: Array<{ action: Action; grants: MatrixRole[] }> = [
  // restaurants
  { action: "restaurant.read",   grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"] },
  { action: "restaurant.update", grants: ["org_owner", "org_admin", "venue_owner"] },
  { action: "restaurant.delete", grants: ["org_owner"] },

  // staff management
  { action: "staff.invite.org",   grants: ["org_owner", "org_admin"] },
  { action: "staff.invite.venue", grants: ["org_owner", "org_admin", "venue_owner"] },
  { action: "staff.remove",       grants: ["org_owner", "org_admin", "venue_owner"] },
  { action: "staff.role.change",  grants: ["org_owner"] }, // §4.3 clarification

  // diners (org-scoped CRM) — org-level roles only
  { action: "diner.read",   grants: ["org_owner", "org_admin", "org_manager"] },
  { action: "diner.update", grants: ["org_owner", "org_admin", "org_manager"] },
  { action: "diner.merge",  grants: ["org_owner", "org_admin", "org_manager"] },
  { action: "diner.split",  grants: ["org_owner", "org_admin", "org_manager"] },

  // reservations
  { action: "reservation.read",                     grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"] },
  { action: "reservation.create",                   grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"] },
  { action: "reservation.modify",                   grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"] },
  { action: "reservation.modify.override_capacity", grants: ["org_owner", "org_admin", "venue_owner", "venue_manager"] },
  { action: "reservation.cancel",                   grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"] },
  { action: "reservation.mark_no_show",             grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"] },

  // marketing
  { action: "campaign.create", grants: ["org_owner", "org_admin", "venue_owner"] },
  { action: "campaign.send",   grants: ["org_owner", "org_admin", "venue_owner"] },
  { action: "campaign.read",   grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"] },
  { action: "campaign.delete", grants: ["org_owner"] },

  // billing
  { action: "billing.read",        grants: ["org_owner", "org_admin"] },
  { action: "billing.update",      grants: ["org_owner"] },
  { action: "subscription.cancel", grants: ["org_owner"] },

  // org
  { action: "org.read",      grants: ["org_owner", "org_admin", "org_manager"] },
  { action: "org.update",    grants: ["org_owner", "org_admin"] },
  { action: "org.delete",    grants: ["org_owner"] },
  { action: "org.add_venue", grants: ["org_owner", "org_admin"] },

  // table mgmt
  { action: "table.read",      grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"] },
  { action: "table.update",    grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager", "venue_host"] },
  { action: "floor_plan.edit", grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"] },

  // events
  { action: "event_request.read",    grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"] },
  { action: "event_request.respond", grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"] },
  { action: "review.respond", grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"] },
  { action: "event_request.quote",   grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"] },

  // analytics
  { action: "analytics.read",   grants: ["org_owner", "org_admin", "org_manager", "venue_owner", "venue_manager"] },
  { action: "analytics.export", grants: ["org_owner", "org_admin", "venue_owner"] },

  // §13 compliance — tavli_admin only (early-return shortcut; no matrix role granted)
  { action: "gdpr.create_dsr",      grants: [] },
  { action: "gdpr.resolve_diner",   grants: [] },
  { action: "gdpr.verify_identity", grants: [] },
  { action: "gdpr.approve_erasure", grants: [] },
  { action: "gdpr.reject",          grants: [] },
  { action: "gdpr.extend_deadline", grants: [] },

  // §14 setup tooling
  { action: "setup_step.transition", grants: ["org_owner", "org_admin", "venue_owner"] },
  { action: "migration.import",      grants: ["org_owner", "org_admin"] },
  { action: "migration.rollback",    grants: ["org_owner", "org_admin"] },
  { action: "admin.setups.view",     grants: [] }, // tavli_admin only (early-return shortcut)
];

describe("PERMISSION_MATRIX", () => {
  it("has a row for every Action declared in SPEC (and vice versa)", () => {
    const matrixKeys = new Set(Object.keys(PERMISSION_MATRIX));
    const specKeys = new Set(SPEC.map((r) => r.action));
    expect([...matrixKeys].sort()).toEqual([...specKeys].sort());
  });

  it("every cell matches the §01 §4.3 specification", () => {
    for (const { action, grants } of SPEC) {
      const row = PERMISSION_MATRIX[action];
      const grantSet = new Set<MatrixRole>(grants);
      for (const role of ALL_ROLES) {
        const expected = grantSet.has(role);
        expect({ action, role, value: row[role] }).toEqual({
          action,
          role,
          value: expected,
        });
      }
    }
  });

  it("never grants org-scoped action `staff.role.change` to venue_owner (§4.3 clarification)", () => {
    expect(PERMISSION_MATRIX["staff.role.change"].venue_owner).toBe(false);
  });
});
