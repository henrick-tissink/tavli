import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CancelReservationSheet } from "../CancelReservationSheet";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock("@/components/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/app/partner/(dashboard)/reservations/actions", () => ({
  cancelReservation: jest.fn(),
}));

import { toast } from "@/components/toast";
import { cancelReservation } from "@/app/partner/(dashboard)/reservations/actions";

const reservation = {
  id: "res-1",
  guestName: "Maria",
  reservationDate: "2026-05-01",
  reservationTime: "19:30",
  partySize: 4,
};

describe("CancelReservationSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders nothing when closed", () => {
    const { container } = render(
      <CancelReservationSheet
        open={false}
        onClose={() => {}}
        reservation={reservation}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("when open, shows the reservation summary", () => {
    render(
      <CancelReservationSheet open onClose={() => {}} reservation={reservation} />,
    );
    expect(screen.getByText(/Maria/)).toBeInTheDocument();
    expect(screen.getByText(/19:30/)).toBeInTheDocument();
    expect(screen.getByText(/party of 4/i)).toBeInTheDocument();
  });

  test("submit button is disabled until a reason pill is selected", () => {
    render(
      <CancelReservationSheet open onClose={() => {}} reservation={reservation} />,
    );
    const submit = screen.getByRole("button", { name: /^cancel reservation$/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /overbooked/i }));
    expect(submit).not.toBeDisabled();
  });

  test("submitting calls cancelReservation with id + selected reason key", async () => {
    (cancelReservation as jest.Mock).mockResolvedValue({
      ok: true,
      emailSent: true,
    });
    const onClose = jest.fn();
    render(
      <CancelReservationSheet open onClose={onClose} reservation={reservation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /overbooked/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel reservation$/i }));

    await waitFor(() => {
      expect(cancelReservation).toHaveBeenCalledWith("res-1", "overbooked");
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Reservation cancelled.");
    });
    expect(onClose).toHaveBeenCalled();
  });

  test("notifies the user when the email could not be sent", async () => {
    (cancelReservation as jest.Mock).mockResolvedValue({
      ok: true,
      emailSent: false,
    });
    render(
      <CancelReservationSheet open onClose={() => {}} reservation={reservation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /overbooked/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel reservation$/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/email/i),
      );
    });
  });

  test("surfaces server errors via toast.error and keeps the sheet open", async () => {
    (cancelReservation as jest.Mock).mockResolvedValue({
      ok: false,
      error: "Reservation not found.",
    });
    const onClose = jest.fn();
    render(
      <CancelReservationSheet open onClose={onClose} reservation={reservation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /overbooked/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel reservation$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Reservation not found.");
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  test("Keep reservation closes the sheet without firing the action", () => {
    const onClose = jest.fn();
    render(
      <CancelReservationSheet open onClose={onClose} reservation={reservation} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /keep reservation/i }));
    expect(onClose).toHaveBeenCalled();
    expect(cancelReservation).not.toHaveBeenCalled();
  });
});
