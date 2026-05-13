"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/button";
import { QuoteForm } from "./QuoteForm";
import { DeclineForm } from "./DeclineForm";
import { MaterializeReservationForm } from "./MaterializeReservationForm";
import {
  markEventRequestViewing,
  replyToEventRequest,
} from "@/app/api/event-requests/actions";

interface ER {
  id: string;
  status: string;
  occasion: string;
  eventDate: string;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  spacePreference: string | null;
  budgetPerHeadCents: number | null;
  menuPreference: string | null;
  dietaryNotes: string | null;
  additionalNotes: string | null;
  partnerResponse: string | null;
  quotedAmountCents: number | null;
}

export function EventRequestDetail({
  er,
  overlaps,
}: {
  er: ER;
  overlaps: { id: string; reservationTime: string; partySize: number }[];
}) {
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<
    "detail" | "quote" | "decline" | "materialize"
  >("detail");
  const [replyText, setReplyText] = useState("");

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {er.occasion} · {er.eventDate} · {er.partySize}
        </h1>
        <p className="text-sm text-zinc-500">
          {er.guestName} · {er.guestEmail}
          {er.guestPhone ? ` · ${er.guestPhone}` : ""}
        </p>
      </header>
      {overlaps.length > 0 && (
        <div className="border border-amber-400 bg-amber-50 rounded p-3 text-sm">
          ⚠ Există {overlaps.length} rezervări regulate pentru această dată.
          Verifică înainte de acceptare.
        </div>
      )}
      <section className="space-y-2">
        {er.spacePreference && (
          <p>
            <strong>Spațiu:</strong> {er.spacePreference}
          </p>
        )}
        {er.budgetPerHeadCents && (
          <p>
            <strong>Buget/pers:</strong>{" "}
            {(er.budgetPerHeadCents / 100).toFixed(0)} lei
          </p>
        )}
        {er.menuPreference && (
          <p>
            <strong>Meniu:</strong> {er.menuPreference}
          </p>
        )}
        {er.dietaryNotes && (
          <p>
            <strong>Restricții:</strong> {er.dietaryNotes}
          </p>
        )}
        {er.additionalNotes && (
          <p>
            <strong>Note:</strong> {er.additionalNotes}
          </p>
        )}
      </section>
      {er.partnerResponse && (
        <section className="bg-zinc-50 p-3 rounded">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Răspunsul tău anterior
          </p>
          <p className="whitespace-pre-line mt-1">{er.partnerResponse}</p>
        </section>
      )}
      {view === "detail" && (
        <div className="space-y-3">
          {(er.status === "new" ||
            er.status === "viewing" ||
            er.status === "replied") && (
            <>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full border rounded p-2"
                rows={3}
                placeholder="Mesaj pentru client..."
              />
              <div className="flex gap-2">
                <Button
                  disabled={pending || replyText.trim().length === 0}
                  onClick={() =>
                    startTransition(() =>
                      replyToEventRequest({
                        id: er.id,
                        message: replyText,
                      }).then(() => location.reload()),
                    )
                  }
                >
                  Trimite răspuns
                </Button>
                <Button variant="secondary" onClick={() => setView("quote")}>
                  Trimite ofertă
                </Button>
                <Button variant="ghost" onClick={() => setView("decline")}>
                  Refuză
                </Button>
              </div>
            </>
          )}
          {er.status === "accepted" && (
            <Button onClick={() => setView("materialize")}>
              Creează rezervare
            </Button>
          )}
          {er.status === "new" && (
            <Button
              variant="ghost"
              onClick={() =>
                startTransition(() =>
                  markEventRequestViewing({ id: er.id }).then(() =>
                    location.reload(),
                  ),
                )
              }
            >
              Marchează ca vizualizată
            </Button>
          )}
        </div>
      )}
      {view === "quote" && (
        <QuoteForm
          eventRequestId={er.id}
          onCancel={() => setView("detail")}
        />
      )}
      {view === "decline" && (
        <DeclineForm
          eventRequestId={er.id}
          onCancel={() => setView("detail")}
        />
      )}
      {view === "materialize" && (
        <MaterializeReservationForm
          eventRequestId={er.id}
          eventDate={er.eventDate}
          partySize={er.partySize}
          onCancel={() => setView("detail")}
        />
      )}
    </main>
  );
}
