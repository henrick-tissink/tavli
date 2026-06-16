import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  ReservationsList,
  type ReservationRow,
} from "../ReservationsList";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roReservations from "@/messages/ro/partner.reservations.json";
import roCommon from "@/messages/ro/partner.common.json";

function renderList(ui: React.ReactElement) {
  return render(
    <MessagesProvider
      locale="ro"
      bundle={{ "partner.reservations": roReservations, "partner.common": roCommon }}
    >
      {ui}
    </MessagesProvider>,
  );
}

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("@/components/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/app/(app)/partner/(dashboard)/reservations/actions", () => ({
  updateReservationStatus: jest.fn().mockResolvedValue({ ok: true }),
  cancelReservation: jest.fn().mockResolvedValue({ ok: true, emailSent: true }),
}));

function row(overrides: Partial<ReservationRow>): ReservationRow {
  return {
    id: "r-base",
    guestName: "Maria",
    guestPhone: "+40 712 345 678",
    guestEmail: "maria@example.com",
    partySize: 4,
    reservationDate: "2026-05-01",
    reservationTime: "19:30:00",
    zone: null,
    table: null,
    notes: null,
    status: "confirmed",
    createdAt: "2026-04-27T10:00:00Z",
    corporateClientName: null,
    ...overrides,
  };
}

describe("ReservationsList", () => {
  test("confirmed row shows Așază la masă, Neprezentat, Anulează — no Finalizează", () => {
    renderList(
      <ReservationsList
        today={[row({ id: "r1", status: "confirmed" })]}
        upcoming={[]}
        past={[]}
      />,
    );
    const tr = screen.getByText("Maria").closest("tr")!;
    const scope = within(tr);
    expect(scope.getByRole("button", { name: /așază la masă/i })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /^neprezentat$/i })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /^anulează$/i })).toBeInTheDocument();
    expect(scope.queryByRole("button", { name: /^finalizează$/i })).toBeNull();
  });

  test("seated row shows Finalizează + Neprezentat but NOT Anulează", () => {
    renderList(
      <ReservationsList
        today={[row({ id: "r2", status: "seated" })]}
        upcoming={[]}
        past={[]}
      />,
    );
    const tr = screen.getByText("Maria").closest("tr")!;
    const scope = within(tr);
    expect(scope.getByRole("button", { name: /^finalizează$/i })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /^neprezentat$/i })).toBeInTheDocument();
    expect(scope.queryByRole("button", { name: /^anulează$/i })).toBeNull();
  });

  test("cancelled / completed / no_show rows show no actions", () => {
    renderList(
      <ReservationsList
        today={[]}
        upcoming={[]}
        past={[
          row({ id: "r3", guestName: "A", status: "completed" }),
          row({ id: "r4", guestName: "B", status: "cancelled" }),
          row({ id: "r5", guestName: "C", status: "no_show" }),
        ]}
      />,
    );
    // Default tab is "today" when no today/upcoming rows; switch to past.
    fireEvent.click(screen.getByRole("button", { name: /^trecute/i }));
    for (const name of ["A", "B", "C"]) {
      const tr = screen.getByText(name).closest("tr")!;
      const scope = within(tr);
      expect(scope.queryByRole("button")).toBeNull();
    }
  });

  test("shows the assigned table: single label, joined combination, and — when unassigned", () => {
    renderList(
      <ReservationsList
        today={[
          row({ id: "r1", guestName: "Single", table: "5" }),
          row({ id: "r2", guestName: "Combo", table: "3+5" }),
          row({ id: "r3", guestName: "Unassigned", table: null }),
        ]}
        upcoming={[]}
        past={[]}
      />,
    );
    expect(within(screen.getByText("Single").closest("tr")!).getByText("5")).toBeInTheDocument();
    expect(within(screen.getByText("Combo").closest("tr")!).getByText("3+5")).toBeInTheDocument();
    // unassigned row renders a dash for the table cell (zone is also null here)
    const unTr = screen.getByText("Unassigned").closest("tr")!;
    expect(within(unTr).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  test("clicking Cancel on a confirmed row opens the cancel sheet with that reservation", () => {
    renderList(
      <ReservationsList
        today={[row({ id: "r6", guestName: "Maria", status: "confirmed" })]}
        upcoming={[]}
        past={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^anulează$/i }));
    // Sheet opens as a dialog with the "Anulează rezervarea" title.
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: /anulează rezervarea/i })).toBeInTheDocument();
    // And shows the chosen reservation's guest name + party size in the summary.
    expect(within(sheet).getByText("Maria")).toBeInTheDocument();
    expect(within(sheet).getByText(/grup de 4/i)).toBeInTheDocument();
  });
});
