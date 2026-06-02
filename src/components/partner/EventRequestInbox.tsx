"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n/messages-provider";
import { EventRequestCard, type Row } from "./EventRequestCard";

export type { Row };

export function EventRequestInbox({ rows }: { rows: Row[] }) {
  const t = useT("partner.corporate");
  const [nowMs] = useState(() => Date.now());
  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="font-display text-lg">{t("inbox.emptyTitle")}</p>
        <p className="text-sm text-text-secondary mt-1">
          {t("inbox.emptyBody")}
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => (
        <EventRequestCard key={r.id} row={r} nowMs={nowMs} />
      ))}
    </div>
  );
}
