import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  ReservationsList,
  type ReservationRow,
} from "../ReservationsList";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("@/components/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/app/partner/(dashboard)/reservations/actions", () => ({
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
    notes: null,
    status: "confirmed",
    createdAt: "2026-04-27T10:00:00Z",
    ...overrides,
  };
}

describe("ReservationsList", () => {
  test("confirmed row shows Mark seated, No-show, Cancel — no Complete", () => {
    render(
      <ReservationsList
        today={[row({ id: "r1", status: "confirmed" })]}
        upcoming={[]}
        past={[]}
      />,
    );
    const tr = screen.getByText("Maria").closest("tr")!;
    const scope = within(tr);
    expect(scope.getByRole("button", { name: /mark seated/i })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /no-show/i })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(scope.queryByRole("button", { name: /^complete$/i })).toBeNull();
  });

  test("seated row shows Complete + No-show but NOT Cancel", () => {
    render(
      <ReservationsList
        today={[row({ id: "r2", status: "seated" })]}
        upcoming={[]}
        past={[]}
      />,
    );
    const tr = screen.getByText("Maria").closest("tr")!;
    const scope = within(tr);
    expect(scope.getByRole("button", { name: /^complete$/i })).toBeInTheDocument();
    expect(scope.getByRole("button", { name: /no-show/i })).toBeInTheDocument();
    expect(scope.queryByRole("button", { name: /^cancel$/i })).toBeNull();
  });

  test("cancelled / completed / no_show rows show no actions", () => {
    render(
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
    fireEvent.click(screen.getByRole("button", { name: /^past/i }));
    for (const name of ["A", "B", "C"]) {
      const tr = screen.getByText(name).closest("tr")!;
      const scope = within(tr);
      expect(scope.queryByRole("button")).toBeNull();
    }
  });

  test("clicking Cancel on a confirmed row opens the cancel sheet with that reservation", () => {
    render(
      <ReservationsList
        today={[row({ id: "r6", guestName: "Maria", status: "confirmed" })]}
        upcoming={[]}
        past={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    // Sheet opens as a dialog with the "Cancel reservation" title.
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: /cancel reservation/i })).toBeInTheDocument();
    // And shows the chosen reservation's guest name + party size in the summary.
    expect(within(sheet).getByText("Maria")).toBeInTheDocument();
    expect(within(sheet).getByText(/party of 4/i)).toBeInTheDocument();
  });
});
