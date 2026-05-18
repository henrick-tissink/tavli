"use client";
import { useState } from "react";
import { EventRequestCard, type Row } from "./EventRequestCard";

export type { Row };

export function EventRequestInbox({ rows }: { rows: Row[] }) {
  const [nowMs] = useState(() => Date.now());
  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="font-display text-lg">Nicio cerere încă.</p>
        <p className="text-sm text-text-secondary mt-1">
          Cererile noi apar aici imediat după ce sunt confirmate prin email.
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
