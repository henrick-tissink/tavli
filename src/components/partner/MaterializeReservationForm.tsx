"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { materializeAcceptedEventRequest } from "@/app/api/event-requests/actions";

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
  const [time, setTime] = useState("19:00");
  const [zone, setZone] = useState("Private Room");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await materializeAcceptedEventRequest({
            id: eventRequestId,
            mode,
            slots: [
              {
                time,
                partySize,
                zone: mode === "private_room" ? zone : undefined,
              },
            ],
          });
          location.reload();
        });
      }}
    >
      <p className="text-sm text-zinc-600">
        Crearea rezervării pentru {eventDate} · {partySize} persoane
      </p>
      <fieldset className="space-y-2">
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="mode"
            checked={mode === "private_room"}
            onChange={() => setMode("private_room")}
          />
          <span>
            <strong>Spațiu privat</strong> · grila normală de rezervări rămâne
            neatinsă
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="mode"
            checked={mode === "whole_venue"}
            onChange={() => setMode("whole_venue")}
          />
          <span>
            <strong>Întregul local</strong> · blochează toate sloturile pentru
            această dată
          </span>
        </label>
      </fieldset>
      <label className="block">
        <span className="text-sm">Oră</span>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-full mt-1 border rounded p-2"
          required
        />
      </label>
      {mode === "private_room" && (
        <label className="block">
          <span className="text-sm">Zonă</span>
          <input
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="w-full mt-1 border rounded p-2"
          />
        </label>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Creează rezervare
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Înapoi
        </Button>
      </div>
    </form>
  );
}
