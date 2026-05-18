"use client";
import Link from "next/link";
import { Calendar, Users, Wallet } from "lucide-react";

const OCCASION_LABELS_RO: Record<string, string> = {
  wedding: "Nuntă",
  birthday: "Aniversare",
  corporate_dinner: "Cină corporate",
  product_launch: "Lansare produs",
  other: "Altele",
};

const STATUS_TONES: Record<string, { label: string; tone: string }> = {
  new: {
    label: "Nou",
    tone: "bg-[color:var(--color-occasion-product-soft)] text-[color:var(--color-occasion-product)]",
  },
  viewing: {
    label: "În lucru",
    tone: "bg-[color:var(--color-occasion-corporate-soft)] text-[color:var(--color-occasion-corporate)]",
  },
  replied: {
    label: "Răspuns",
    tone: "bg-surface-bg text-text-secondary",
  },
  quoted: {
    label: "Ofertă trimisă",
    tone: "bg-[color:var(--color-occasion-wedding-soft)] text-[color:var(--color-occasion-wedding)]",
  },
  accepted: {
    label: "Acceptat",
    tone: "bg-green-100 text-green-700",
  },
  declined: {
    label: "Refuzat",
    tone: "bg-zinc-100 text-zinc-500",
  },
};

export interface Row {
  id: string;
  occasion: string;
  eventDate: string;
  partySize: number;
  guestName: string;
  status: string;
  createdAt: Date;
  budgetPerHeadCents: number | null;
}

export function EventRequestCard({
  row,
  nowMs,
}: {
  row: Row;
  nowMs: number;
}) {
  const days = Math.floor(
    (nowMs - new Date(row.createdAt).getTime()) / 86_400_000,
  );
  const urgent = row.status === "new" && days >= 2;
  const tone = STATUS_TONES[row.status] ?? {
    label: row.status,
    tone: "bg-surface-bg text-text-secondary",
  };
  return (
    <Link
      href={`/partner/corporate/events/${row.id}`}
      className={`block rounded-card border bg-surface-white p-4 hover:shadow-card-hover transition-shadow ${urgent ? "border-amber-400" : "border-border"}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{row.guestName}</p>
          <p className="text-sm text-text-secondary">
            {OCCASION_LABELS_RO[row.occasion] ?? row.occasion}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${tone.tone}`}
        >
          {tone.label}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-sm text-text-secondary">
        <span className="inline-flex items-center gap-1">
          <Calendar className="w-4 h-4" /> {row.eventDate}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="w-4 h-4" /> {row.partySize} pers.
        </span>
        {row.budgetPerHeadCents != null && (
          <span className="inline-flex items-center gap-1">
            <Wallet className="w-4 h-4" />{" "}
            {Math.round(row.budgetPerHeadCents / 100)} lei/pers
          </span>
        )}
        <span className={`ml-auto ${urgent ? "text-amber-600 font-medium" : ""}`}>
          {days} zile
        </span>
      </div>
    </Link>
  );
}
