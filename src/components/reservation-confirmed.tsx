"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MapPin, Phone, CalendarPlus } from "lucide-react";
import { ReservationCancelForm } from "@/components/reservation-cancel-form";

export interface ReservationConfirmedProps {
  token: string;
  restaurantName: string;
  restaurantSlug: string;
  cityHint?: string;
  photoUrl?: string;
  heroNote?: string;
  date: string; // ISO yyyy-mm-dd
  time: string; // "HH:MM:SS" or "HH:MM"
  partySize: number;
  zone: string | null;
  guestName: string;
  address: string;
  phone?: string;
  lat: number | null;
  lng: number | null;
}

// ── ICS generation ──────────────────────────────────────────────────────────

function buildIcsDataUrl(p: {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  location: string;
}): string {
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tavli//RO",
    "BEGIN:VEVENT",
    `UID:${p.uid}@tavli.ro`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(p.start)}`,
    `DTEND:${fmt(p.end)}`,
    `SUMMARY:${p.summary}`,
    `LOCATION:${p.location}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(content);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRoDate(isoDate: string, isoTime: string) {
  // Use noon to avoid DST edge cases in date formatting
  const d = new Date(`${isoDate}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("ro-RO", { weekday: "long" }).format(d);
  const full = new Intl.DateTimeFormat("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  const timeDisplay = isoTime.slice(0, 5); // "HH:MM"
  return { weekday, full, timeDisplay };
}

// ── Component ────────────────────────────────────────────────────────────────

export function ReservationConfirmed({
  token,
  restaurantName,
  restaurantSlug,
  cityHint,
  photoUrl,
  heroNote,
  date,
  time,
  partySize,
  zone,
  guestName,
  address,
  phone,
  lat,
  lng,
}: ReservationConfirmedProps) {
  const [showCancel, setShowCancel] = useState(false);

  const { weekday, full, timeDisplay } = formatRoDate(date, time);

  // Build the Date objects for ICS
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const dtStart = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute ?? 0, 0));
  const dtEnd = new Date(dtStart.getTime() + 2 * 60 * 60 * 1000);

  const icsHref = buildIcsDataUrl({
    uid: token,
    summary: `Rezervare la ${restaurantName}`,
    start: dtStart,
    end: dtEnd,
    location: address,
  });

  const mapsUrl =
    lat != null && lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : null;

  const detailHref =
    cityHint ? `/${cityHint}/${restaurantSlug}` : `/${restaurantSlug}`;

  return (
    <div className="min-h-screen bg-surface-bg">
      {/* ── 1. Cover photo with date overlay ─────────────────────────────── */}
      <div className="relative w-full h-[320px] desktop:h-[480px] overflow-hidden">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={restaurantName}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-stone-800 to-stone-950" />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Overlay content — bottom left */}
        <div className="absolute bottom-0 left-0 p-5 desktop:p-8">
          <p className="text-white/85 text-xs tracking-[0.3em] uppercase font-semibold">
            CONFIRMAT
          </p>
          <h1 className="font-display text-3xl desktop:text-5xl text-white font-bold mt-2 tracking-tight leading-tight">
            {restaurantName}
          </h1>
          <p className="text-white/95 text-base desktop:text-lg mt-1">
            {full} · {timeDisplay}
          </p>
        </div>

        {/* Back link — top left */}
        <Link
          href={detailHref}
          className="absolute top-4 left-4 text-white/80 text-xs font-semibold tracking-[0.15em] uppercase hover:text-white transition-colors"
        >
          ← {restaurantName}
        </Link>
      </div>

      {/* ── 2. Headline card ─────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 desktop:px-6 mt-8">
        <h2 className="font-display text-2xl desktop:text-3xl font-bold text-text-primary leading-tight">
          Te așteaptă {weekday}, la {timeDisplay}.
        </h2>
        <p className="text-text-secondary mt-2">
          Pentru {partySize} {partySize === 1 ? "persoană" : "persoane"}, la{" "}
          {restaurantName}
          {zone ? ` · ${zone}` : ""}.
        </p>
        <p className="text-text-muted text-sm mt-1">{guestName}</p>
      </div>

      {/* ── 3. Editorial pull-quote (heroNote) ───────────────────────────── */}
      {heroNote && (
        <section className="mt-8 desktop:mt-10 max-w-2xl mx-auto px-4">
          <p className="text-xs tracking-[0.3em] uppercase text-brand-primary font-semibold text-center">
            CE TE AȘTEAPTĂ
          </p>
          <p className="font-display italic text-xl desktop:text-2xl text-text-primary text-center leading-snug mt-3">
            {heroNote}
          </p>
        </section>
      )}

      {/* ── 4. Practical info card ───────────────────────────────────────── */}
      <div className="mt-10 max-w-3xl mx-auto px-4 desktop:px-6">
        <div className="rounded-card bg-surface-white border border-border shadow-card divide-y divide-border">
          {/* Address row */}
          <div className="flex items-start gap-4 p-5">
            <MapPin className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary">Adresa</p>
              <p className="text-sm text-text-secondary mt-0.5">{address}</p>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-brand-primary mt-1 inline-block hover:underline"
                >
                  Indicații rutiere →
                </a>
              )}
            </div>
          </div>

          {/* Phone row */}
          {phone && (
            <div className="flex items-start gap-4 p-5">
              <Phone className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary">Telefon</p>
                <a
                  href={`tel:${phone}`}
                  className="text-sm text-brand-primary mt-0.5 hover:underline"
                >
                  {phone}
                </a>
              </div>
            </div>
          )}

          {/* Calendar row */}
          <div className="flex items-start gap-4 p-5">
            <CalendarPlus className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary">
                Adaugă în calendar
              </p>
              <a
                href={icsHref}
                download="rezervare-tavli.ics"
                className="text-sm text-brand-primary mt-0.5 inline-block hover:underline"
                aria-label="Descarcă fișier calendar"
              >
                Descarcă .ics
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Secondary cancel section ─────────────────────────────────── */}
      <div className="mt-12 max-w-3xl mx-auto px-4 desktop:px-6 text-center text-sm pb-16">
        <p className="text-text-muted">
          Trebuie să anulezi?{" "}
          <button
            type="button"
            onClick={() => setShowCancel((v) => !v)}
            className="text-brand-primary underline hover:no-underline"
          >
            Anulează rezervarea
          </button>
        </p>

        {showCancel && (
          <div className="mt-6 text-left">
            <ReservationCancelForm
              token={token}
              restaurantName={restaurantName}
            />
          </div>
        )}
      </div>
    </div>
  );
}
