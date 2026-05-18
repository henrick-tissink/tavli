"use client";

import { useState, useTransition } from "react";
import {
  Calendar,
  Users,
  Mail,
  Phone,
  User,
  DoorOpen,
  Wallet,
  UtensilsCrossed,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { Button } from "@/components/button";
import { QuoteForm } from "./QuoteForm";
import { DeclineForm } from "./DeclineForm";
import { MaterializeReservationForm } from "./MaterializeReservationForm";
import { RevenueEstimateWidget } from "./RevenueEstimateWidget";
import {
  markEventRequestViewing,
  replyToEventRequest,
} from "@/app/api/event-requests/actions";

const OCCASION_LABELS_RO: Record<string, string> = {
  wedding: "Nuntă",
  birthday: "Aniversare",
  corporate_dinner: "Cină corporate",
  product_launch: "Lansare produs",
  other: "Altele",
};

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
  privateSpaceName: string | null;
  claimedCompanyCui: string | null;
  claimedCompanyName: string | null;
}

function IconField({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 mt-0.5 text-text-muted shrink-0" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-text-muted">
          {label}
        </p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-border p-3 bg-surface-white">
      <p className="text-xs uppercase tracking-wider text-text-muted mb-1">
        {label}
      </p>
      <p className="text-sm whitespace-pre-line">{children}</p>
    </div>
  );
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
  const occasionLabel =
    OCCASION_LABELS_RO[er.occasion] ?? er.occasion;

  return (
    <main className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">
          {occasionLabel} · {er.partySize} pers.
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Cerere de la {er.guestName} pentru {er.eventDate}
        </p>
      </header>

      {overlaps.length > 0 && (
        <div className="border border-amber-400 bg-amber-50 rounded-card p-3 text-sm mb-6 inline-flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <span>
            Există {overlaps.length} rezervări regulate pentru această dată.
            Verifică înainte de acceptare.
          </span>
        </div>
      )}

      <div className="grid gap-6 desktop:grid-cols-3">
        <div className="desktop:col-span-2 space-y-6">
          <section className="rounded-card border border-border bg-surface-white p-4">
            <h2 className="font-display text-lg font-bold mb-4">
              Detalii eveniment
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <IconField
                icon={Calendar}
                label="Dată"
                value={er.eventDate}
              />
              <IconField
                icon={Users}
                label="Număr persoane"
                value={`${er.partySize}`}
              />
              {er.spacePreference && (
                <IconField
                  icon={DoorOpen}
                  label="Preferință spațiu"
                  value={er.spacePreference}
                />
              )}
              {er.privateSpaceName && (
                <IconField
                  icon={DoorOpen}
                  label="Spațiu privat"
                  value={er.privateSpaceName}
                />
              )}
              {er.budgetPerHeadCents != null && (
                <IconField
                  icon={Wallet}
                  label="Buget / pers"
                  value={`${Math.round(er.budgetPerHeadCents / 100)} lei`}
                />
              )}
              {er.menuPreference && (
                <IconField
                  icon={UtensilsCrossed}
                  label="Meniu"
                  value={er.menuPreference}
                />
              )}
            </div>
          </section>

          {(er.dietaryNotes || er.additionalNotes) && (
            <section className="space-y-3">
              {er.dietaryNotes && (
                <Block label="Restricții alimentare">{er.dietaryNotes}</Block>
              )}
              {er.additionalNotes && (
                <Block label="Note suplimentare">{er.additionalNotes}</Block>
              )}
            </section>
          )}

          {er.partnerResponse && (
            <section className="rounded-card border border-border bg-surface-bg p-4">
              <p className="text-xs uppercase tracking-wider text-text-muted mb-1">
                Răspunsul tău anterior
              </p>
              <p className="whitespace-pre-line text-sm">
                {er.partnerResponse}
              </p>
            </section>
          )}

          {view === "detail" && (
            <section className="space-y-3">
              {(er.status === "new" ||
                er.status === "viewing" ||
                er.status === "replied") && (
                <>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="w-full border border-border rounded-card p-2"
                    rows={3}
                    maxLength={2000}
                    placeholder="Mesaj pentru client..."
                  />
                  <div className="flex flex-wrap gap-2">
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
                    <Button
                      variant="secondary"
                      onClick={() => setView("quote")}
                    >
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
            </section>
          )}
          {view === "quote" && (
            <QuoteForm
              eventRequestId={er.id}
              partySize={er.partySize}
              budgetPerHeadCents={er.budgetPerHeadCents}
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
        </div>

        <aside className="space-y-4">
          <RevenueEstimateWidget
            partySize={er.partySize}
            budgetPerHeadCents={er.budgetPerHeadCents}
          />
          <section className="rounded-card border border-border bg-surface-white p-4">
            <h3 className="font-display text-base font-bold mb-3">Client</h3>
            <div className="space-y-3">
              <IconField icon={User} label="Nume" value={er.guestName} />
              <IconField icon={Mail} label="Email" value={er.guestEmail} />
              {er.guestPhone && (
                <IconField
                  icon={Phone}
                  label="Telefon"
                  value={er.guestPhone}
                />
              )}
              {(er.claimedCompanyName || er.claimedCompanyCui) && (
                <IconField
                  icon={Building2}
                  label="Companie"
                  value={
                    <>
                      {er.claimedCompanyName ?? "—"}
                      {er.claimedCompanyCui && (
                        <span className="block text-xs text-text-muted">
                          CUI: {er.claimedCompanyCui}
                        </span>
                      )}
                    </>
                  }
                />
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
