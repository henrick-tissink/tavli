"use client";

import Link from "next/link";
import { useState } from "react";

interface Row {
  id: string;
  occasion: string;
  eventDate: string;
  partySize: number;
  guestName: string;
  status: string;
  createdAt: Date;
}

const STATUS_LABELS_RO: Record<string, string> = {
  new: "Nou",
  viewing: "Vizualizat",
  replied: "Răspuns",
  quoted: "Cu ofertă",
  accepted: "Acceptat",
  declined: "Refuzat",
  cancelled: "Anulat",
  expired_quote: "Ofertă expirată",
  expired: "Expirat",
  completed: "Finalizat",
};

const OCCASION_LABELS_RO: Record<string, string> = {
  wedding: "Nuntă",
  birthday: "Aniversare",
  corporate_dinner: "Cină corporate",
  product_launch: "Lansare produs",
  other: "Altele",
};

export function EventRequestInbox({ rows }: { rows: Row[] }) {
  // Pinned at mount so the table doesn't re-flow on unrelated re-renders.
  // Days-since-creation only changes by 1 per day; a stable reading is fine.
  const [nowMs] = useState(() => Date.now());
  if (rows.length === 0)
    return <p className="text-zinc-500">Nicio cerere încă.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-zinc-500">
        <tr>
          <th className="py-2">Ocazie</th>
          <th>Dată</th>
          <th>Persoane</th>
          <th>Solicitant</th>
          <th>Status</th>
          <th>Zile</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const days = Math.floor(
            (nowMs - new Date(r.createdAt).getTime()) / 86_400_000,
          );
          return (
            <tr key={r.id} className="border-t hover:bg-zinc-50">
              <td className="py-2">
                <Link href={`/partner/corporate/events/${r.id}`}>
                  {OCCASION_LABELS_RO[r.occasion] ?? r.occasion}
                </Link>
              </td>
              <td>{r.eventDate}</td>
              <td>{r.partySize}</td>
              <td>{r.guestName}</td>
              <td>
                <span className="px-2 py-1 rounded bg-zinc-100 text-xs">
                  {STATUS_LABELS_RO[r.status] ?? r.status}
                </span>
              </td>
              <td>{days}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
