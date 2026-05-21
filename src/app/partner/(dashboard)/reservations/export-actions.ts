"use server";

/**
 * §02 §4.8 — bulkExportReservations.
 *
 * Exports a partner's reservations within a date range as CSV. Scope is
 * either a single restaurant (most common) or an entire organization
 * (org-owner / org-admin only). Gated by can('analytics.export'); audited
 * via AUDIT.analytics.export_run.
 *
 * Returns base64-encoded CSV bytes so the caller (a future download
 * button in the partner dashboard) can decode + trigger a file save
 * without the server having to stream a Response.
 *
 * Format restricted to 'csv' for v1; XLSX support deferred (requires
 * exceljs). Pseudonymised-diner exclusion is a structural placeholder
 * via the `includeRedacted: false` literal; the actual filter wires up
 * in §03 when the diners table lands.
 */

import { z } from "zod";
import { and, asc, between, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { reservations, restaurants } from "@/lib/db/schema";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { getActorRole } from "@/lib/audit/actor-role";
import { csvStringify, type CsvColumn } from "@/lib/csv/stringify";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(from: string, to: string): number {
  const f = new Date(from + "T00:00:00Z").getTime();
  const t = new Date(to + "T00:00:00Z").getTime();
  return Math.round((t - f) / (1000 * 60 * 60 * 24));
}

const inputSchema = z
  .object({
    restaurantId: z.string().uuid().optional(),
    organizationId: z.string().uuid().optional(),
    dateFrom: z.string().regex(DATE_RE),
    dateTo: z.string().regex(DATE_RE),
    format: z.literal("csv"),
    includeRedacted: z.literal(false).optional(),
  })
  .refine(
    (i) => Boolean(i.restaurantId) !== Boolean(i.organizationId),
    { message: "Specify exactly one of restaurantId or organizationId." },
  )
  .refine((i) => i.dateFrom <= i.dateTo, {
    message: "dateFrom must be on or before dateTo.",
  })
  .refine((i) => daysBetween(i.dateFrom, i.dateTo) <= 365, {
    message: "Date range cannot exceed 365 days.",
  });

export type BulkExportReservationsInput = z.infer<typeof inputSchema>;

export interface BulkExportReservationsResult {
  ok: boolean;
  error?: string;
  filename?: string;
  contentBase64?: string;
  rowCount?: number;
}

const RESTAURANT_COLUMNS: CsvColumn[] = [
  { key: "reservation_date", header: "Reservation Date" },
  { key: "reservation_time", header: "Reservation Time" },
  { key: "guest_name", header: "Guest Name" },
  { key: "guest_phone", header: "Guest Phone" },
  { key: "guest_email", header: "Guest Email" },
  { key: "party_size", header: "Party Size" },
  { key: "zone", header: "Zone" },
  { key: "status", header: "Status" },
  { key: "notes", header: "Notes" },
  { key: "created_at", header: "Created At" },
];

const ORG_COLUMNS: CsvColumn[] = [
  { key: "restaurant_name", header: "Restaurant" },
  ...RESTAURANT_COLUMNS,
];

interface ReservationRow {
  restaurantName?: string;
  reservationDate: string;
  reservationTime: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  zone: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
}

function rowToCsvRecord(r: ReservationRow): Record<string, string | number | null> {
  return {
    restaurant_name: r.restaurantName ?? null,
    reservation_date: r.reservationDate,
    reservation_time: r.reservationTime,
    guest_name: r.guestName,
    guest_phone: r.guestPhone,
    guest_email: r.guestEmail,
    party_size: r.partySize,
    zone: r.zone,
    status: r.status,
    notes: r.notes,
    created_at: r.createdAt.toISOString(),
  };
}

export async function bulkExportReservations(
  raw: BulkExportReservationsInput,
): Promise<BulkExportReservationsResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Not signed in." };

  // Build the subject + resolve the restaurant's organization_id when
  // restaurant-scoped (can() needs it for the cross-scope grant check).
  let restaurantOrganizationId: string | null = null;
  if (input.restaurantId) {
    const [row] = await dbAdmin
      .select({ organizationId: restaurants.organizationId })
      .from(restaurants)
      .where(eq(restaurants.id, input.restaurantId))
      .limit(1);
    if (!row) return { ok: false, error: "Restaurant not found." };
    restaurantOrganizationId = row.organizationId;
  }

  const allowed = input.restaurantId
    ? await can(session, "analytics.export", {
        kind: "restaurant",
        id: input.restaurantId,
        organization_id: restaurantOrganizationId!,
      })
    : await can(session, "analytics.export", {
        kind: "organization",
        id: input.organizationId!,
      });
  if (!allowed) return { ok: false, error: "Forbidden." };

  // Query reservations for the scope.
  const rows: ReservationRow[] = [];
  if (input.restaurantId) {
    const result = await dbAdmin
      .select({
        reservationDate: reservations.reservationDate,
        reservationTime: reservations.reservationTime,
        guestName: reservations.guestName,
        guestPhone: reservations.guestPhone,
        guestEmail: reservations.guestEmail,
        partySize: reservations.partySize,
        zone: reservations.zone,
        status: reservations.status,
        notes: reservations.notes,
        createdAt: reservations.createdAt,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, input.restaurantId),
          between(reservations.reservationDate, input.dateFrom, input.dateTo),
        ),
      )
      .orderBy(asc(reservations.reservationDate), asc(reservations.reservationTime), asc(reservations.createdAt));
    rows.push(...result);
  } else {
    const result = await dbAdmin
      .select({
        restaurantName: restaurants.name,
        reservationDate: reservations.reservationDate,
        reservationTime: reservations.reservationTime,
        guestName: reservations.guestName,
        guestPhone: reservations.guestPhone,
        guestEmail: reservations.guestEmail,
        partySize: reservations.partySize,
        zone: reservations.zone,
        status: reservations.status,
        notes: reservations.notes,
        createdAt: reservations.createdAt,
      })
      .from(reservations)
      .innerJoin(restaurants, eq(restaurants.id, reservations.restaurantId))
      .where(
        and(
          eq(restaurants.organizationId, input.organizationId!),
          between(reservations.reservationDate, input.dateFrom, input.dateTo),
        ),
      )
      .orderBy(asc(reservations.reservationDate), asc(reservations.reservationTime), asc(reservations.createdAt));
    rows.push(...result);
  }

  const columns = input.restaurantId ? RESTAURANT_COLUMNS : ORG_COLUMNS;
  const csv = csvStringify(rows.map(rowToCsvRecord), columns);
  const contentBase64 = Buffer.from(csv, "utf8").toString("base64");

  const scopeSuffix = input.restaurantId
    ? input.restaurantId.slice(-8)
    : input.organizationId!.slice(-8);
  const filename = `reservations-${scopeSuffix}-${input.dateFrom}-to-${input.dateTo}.csv`;

  // Audit — the actor's role is resolved against a representative
  // restaurant. For org-scope without a specific restaurant, we pick any
  // restaurant in the org so the resolver can compute org-level roles.
  let auditRestaurantId = input.restaurantId ?? null;
  if (!auditRestaurantId && input.organizationId) {
    const [orgRestaurant] = await dbAdmin
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.organizationId, input.organizationId))
      .limit(1);
    auditRestaurantId = orgRestaurant?.id ?? null;
  }
  const actorRole = auditRestaurantId
    ? await getActorRole(session, auditRestaurantId)
    : "tavli_admin";

  await recordAudit({
    action: AUDIT.analytics.export_run,
    subjectType: "reservation_export",
    actorUserId: session.userId,
    actorRole,
    restaurantId: input.restaurantId ?? null,
    organizationId: input.organizationId ?? restaurantOrganizationId,
    context: {
      date_from: input.dateFrom,
      date_to: input.dateTo,
      format: "csv",
      row_count: rows.length,
      scope: input.restaurantId ? "restaurant" : "organization",
    },
  });

  return {
    ok: true,
    filename,
    contentBase64,
    rowCount: rows.length,
  };
}
