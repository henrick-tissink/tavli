"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/button";
import { materializeAcceptedEventRequest } from "@/app/api/event-requests/actions";

interface Slot {
  start: string;
  capacity: number;
}

export function MaterializeReservationForm({
  eventRequestId,
  eventDate,
  partySize,
  onCancel,
}: {
  eventRequestId: string;
  eventDate: string;
  partySize: number;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"private_room" | "whole_venue">(
    "private_room",
  );
  const [zone, setZone] = useState("Private Room");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/partner/availability-slots?date=${eventDate}`)
      .then((r) => r.json())
      .then((data: { slots: Slot[] }) => {
        if (cancelled) return;
        setSlots(data.slots ?? []);
        if (data.slots && data.slots.length > 0) {
          // Trim to HH:mm to match the time input format used on submit.
          setSelectedTime(data.slots[0].start.slice(0, 5));
        }
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventDate]);

  function submit() {
    if (!selectedTime) return;
    startTransition(async () => {
      await materializeAcceptedEventRequest({
        id: eventRequestId,
        mode,
        slots: [
          {
            time: selectedTime,
            partySize,
            zone: mode === "private_room" ? zone : undefined,
          },
        ],
      });
      location.reload();
    });
  }

  return (
    <section className="space-y-4 rounded-card border border-border p-4 bg-surface-white">
      <h3 className="font-display text-lg font-bold">
        Materializează rezervare
      </h3>
      <p className="text-sm text-text-secondary">
        Pentru {eventDate} · {partySize} persoane
      </p>

      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-wider text-text-muted mb-1">
          Mod de blocare
        </legend>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="mode"
            checked={mode === "private_room"}
            onChange={() => setMode("private_room")}
          />
          <span className="text-sm">
            <strong>Spațiu privat</strong> · grila normală de rezervări rămâne
            neatinsă
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="mode"
            checked={mode === "whole_venue"}
            onChange={() => setMode("whole_venue")}
          />
          <span className="text-sm">
            <strong>Întregul local</strong> · blochează toate sloturile pentru
            această dată
          </span>
        </label>
      </fieldset>

      {mode === "private_room" && (
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-text-muted">
            Zonă
          </span>
          <input
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="w-full mt-1 border border-border rounded-card p-2"
          />
        </label>
      )}

      <div>
        <p className="text-xs uppercase tracking-wider text-text-muted mb-2">
          Selectează ora
        </p>
        {loading ? (
          <p className="text-sm text-text-secondary">Se încarcă sloturile…</p>
        ) : slots && slots.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => {
              const time = s.start.slice(0, 5);
              const active = selectedTime === time;
              return (
                <button
                  key={s.start}
                  type="button"
                  onClick={() => setSelectedTime(time)}
                  className={`text-sm px-3 py-1.5 rounded-full border ${
                    active
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-surface-bg border-border hover:bg-border"
                  }`}
                >
                  {time}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-text-secondary space-y-2">
            <p>
              Nu există sloturi configurate pentru această zi. Introduceți ora
              manual.
            </p>
            <input
              type="time"
              value={selectedTime ?? "19:00"}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="border border-border rounded-card p-2"
            />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          Înapoi
        </Button>
        <Button
          onClick={submit}
          disabled={pending || !selectedTime}
        >
          Creează rezervare
        </Button>
      </div>
    </section>
  );
}
