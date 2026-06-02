import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { freezeClock, unfreezeClock } from "@/test-support/clock";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roBooking from "@/messages/ro/booking.json";

// Mock server action to avoid loading Resend / server-only imports
jest.mock("@/app/api/reservations/actions", () => ({
  createReservation: jest
    .fn()
    .mockResolvedValue({ ok: true, mode: "mock", reservationId: "r-123", confirmationToken: "tok-abc" }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import { createReservation } from "@/app/api/reservations/actions";
const createReservationMock = createReservation as jest.Mock;

import { ReservationSheetV2 } from "../index";

const bundle = { booking: roBooking };

function renderSheet(props: React.ComponentProps<typeof ReservationSheetV2>) {
  return render(
    <MessagesProvider locale="ro" bundle={bundle}>
      <ReservationSheetV2 {...props} />
    </MessagesProvider>,
  );
}

const defaultProps = {
  open: true,
  onClose: jest.fn(),
  restaurantId: "rest-1",
  restaurantName: "Caru' cu Bere",
  rating: 4.8,
  availableSlots: ["18:00", "19:30"],
};

describe("ReservationSheetV2 orchestrator", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    // Freeze to morning so "Astăzi" + the 18:00/19:30 slots stay in the future
    // regardless of when the suite runs (the sheet filters past slots for today).
    freezeClock();
    createReservationMock.mockClear();
    // Mock the date-slots fetch the orchestrator fires when form.date changes.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ slots: ["18:00", "19:30"] }),
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    unfreezeClock();
  });

  it("renders Step 1 (date) with progress bar on open", () => {
    renderSheet(defaultProps);
    expect(screen.getByText(/Când vrei să rezervi/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText(/Pas 1 din 4/i)).toBeInTheDocument();
  });

  it("Continuă is disabled until date is selected", () => {
    renderSheet(defaultProps);
    const continuaBtn = screen.getByRole("button", { name: /Continuă/i });
    expect(continuaBtn).toBeDisabled();
  });

  it("full happy-path: date → party → slot → identity → sent", async () => {
    const user = userEvent.setup();
    renderSheet(defaultProps);

    // Step 1 — Date: click "Astăzi"
    await user.click(screen.getByRole("button", { name: /Astăzi/i }));
    const continua1 = screen.getByRole("button", { name: /Continuă/i });
    expect(continua1).not.toBeDisabled();
    await user.click(continua1);

    // Step 2 — Party: default 2 is valid, just continue
    await screen.findByText(/Câte persoane/i);
    await user.click(screen.getByRole("button", { name: /Continuă/i }));

    // Step 3 — Slot: pick "19:30"
    await screen.findByText(/La ce oră/i);
    await user.click(screen.getByRole("button", { name: "19:30" }));
    await user.click(screen.getByRole("button", { name: /Continuă/i }));

    // Step 4 — Identity: fill name + phone
    await screen.findByText(/Detaliile tale/i);
    fireEvent.change(screen.getByLabelText(/Nume/i), {
      target: { value: "Ion Popescu" },
    });
    fireEvent.change(screen.getByLabelText(/Telefon/i), {
      target: { value: "0712345678" },
    });
    const submitBtn = screen.getByRole("button", {
      name: /Trimite rezervarea/i,
    });
    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    // Step 5 — Sent confirmation
    await screen.findByText(/Rezervarea ta este confirmată/i);

    // Verify the action was called once with expected payload
    expect(createReservationMock).toHaveBeenCalledTimes(1);
    expect(createReservationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: "rest-1",
        time: "19:30",
        partySize: 2,
        guestName: "Ion Popescu",
        guestPhone: "0712345678",
      }),
    );
  });

  it("back button navigates to previous step without clearing data", async () => {
    const user = userEvent.setup();
    renderSheet(defaultProps);

    // Advance to step 2
    await user.click(screen.getByRole("button", { name: /Astăzi/i }));
    await user.click(screen.getByRole("button", { name: /Continuă/i }));
    await screen.findByText(/Câte persoane/i);

    // Go back to step 1
    await user.click(screen.getByRole("button", { name: /Înapoi/i }));
    await screen.findByText(/Când vrei să rezervi/i);
    // Back button absent on first step
    expect(
      screen.queryByRole("button", { name: /Înapoi/i }),
    ).not.toBeInTheDocument();
  });

  it("resets to step 1 when reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MessagesProvider locale="ro" bundle={bundle}>
        <ReservationSheetV2 {...defaultProps} open={true} />
      </MessagesProvider>,
    );

    // Advance to step 2
    await user.click(screen.getByRole("button", { name: /Astăzi/i }));
    await user.click(screen.getByRole("button", { name: /Continuă/i }));
    await screen.findByText(/Câte persoane/i);

    // Close and reopen
    rerender(
      <MessagesProvider locale="ro" bundle={bundle}>
        <ReservationSheetV2 {...defaultProps} open={false} />
      </MessagesProvider>,
    );
    rerender(
      <MessagesProvider locale="ro" bundle={bundle}>
        <ReservationSheetV2 {...defaultProps} open={true} />
      </MessagesProvider>,
    );

    // Should be back on step 1
    await screen.findByText(/Când vrei să rezervi/i);
  });
});
