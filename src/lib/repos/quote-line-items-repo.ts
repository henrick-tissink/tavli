import { dbAdmin } from "@/lib/db/admin";
import { eventRequestQuoteLineItems } from "@/lib/db/schema";
import { asc, eq, sql } from "drizzle-orm";

type Line = typeof eventRequestQuoteLineItems.$inferSelect;

export interface NewLine {
  label: string;
  amountCents: number;
}

export async function replaceLineItems(
  eventRequestId: string,
  lines: NewLine[],
): Promise<void> {
  for (const l of lines) {
    if (l.label.trim().length === 0) {
      throw new Error("line item label cannot be blank");
    }
    if (!Number.isFinite(l.amountCents)) {
      throw new Error(`line item amount_cents must be a finite number (got ${l.amountCents})`);
    }
  }

  await dbAdmin.transaction(async (tx) => {
    await tx
      .delete(eventRequestQuoteLineItems)
      .where(eq(eventRequestQuoteLineItems.eventRequestId, eventRequestId));
    if (lines.length === 0) return;
    await tx.insert(eventRequestQuoteLineItems).values(
      lines.map((l, idx) => ({
        eventRequestId,
        label: l.label,
        amountCents: l.amountCents,
        sortOrder: idx,
      })),
    );
  });
}

export async function listLineItems(eventRequestId: string): Promise<Line[]> {
  return dbAdmin
    .select()
    .from(eventRequestQuoteLineItems)
    .where(eq(eventRequestQuoteLineItems.eventRequestId, eventRequestId))
    .orderBy(asc(eventRequestQuoteLineItems.sortOrder));
}

export async function sumLineItemCents(eventRequestId: string): Promise<number> {
  const [{ total }] = await dbAdmin
    .select({ total: sql<number>`COALESCE(SUM(${eventRequestQuoteLineItems.amountCents}), 0)::int` })
    .from(eventRequestQuoteLineItems)
    .where(eq(eventRequestQuoteLineItems.eventRequestId, eventRequestId));
  return total;
}
