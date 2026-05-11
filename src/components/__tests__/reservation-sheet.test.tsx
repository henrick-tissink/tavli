import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock server-action module to avoid loading Resend (pulls in postal-mime
// which needs TextEncoder — not available in jsdom by default).
jest.mock("@/app/api/reservations/actions", () => ({
  createReservation: jest.fn(async () => ({
    ok: true,
    mode: "mock",
    reservationId: "mock-test",
  })),
}));

import { createReservation } from "@/app/api/reservations/actions";
const createReservationMock = createReservation as jest.Mock;

import { ReservationSheet } from "../reservation-sheet";

describe("ReservationSheet", () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    restaurantName: "Casa Veche",
    rating: 4.7,
    availableSlots: ["19:00", "19:30", "20:00", "20:30"],
    zones: ["Terrace", "Indoor", "Bar"],
  };

  it("renders restaurant name", () => {
    render(<ReservationSheet {...defaultProps} />);
    expect(screen.getByText("Casa Veche")).toBeInTheDocument();
  });

  it("renders guest buttons with 2 selected by default", () => {
    render(<ReservationSheet {...defaultProps} />);
    const btn2 = screen.getByRole("button", { name: "2" });
    expect(btn2).toHaveClass("bg-brand-primary");
  });

  it("shows available time slots", () => {
    render(<ReservationSheet {...defaultProps} />);
    expect(screen.getByText("19:00")).toBeInTheDocument();
    expect(screen.getByText("20:00")).toBeInTheDocument();
  });

  it("shows form fields after selecting a time slot", async () => {
    const user = userEvent.setup();
    render(<ReservationSheet {...defaultProps} />);
    await user.click(screen.getByText("19:00"));
    expect(screen.getByPlaceholderText("Numele tău")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Număr de telefon")).toBeInTheDocument();
  });

  it("confirm button is disabled without name and phone", async () => {
    const user = userEvent.setup();
    render(<ReservationSheet {...defaultProps} />);
    await user.click(screen.getByText("19:00"));
    const confirmBtn = screen.getByRole("button", { name: /confirmă/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("preselected slot is selected when sheet opens", () => {
    render(<ReservationSheet {...defaultProps} preSelectedSlot="19:30" />);
    const slot = screen.getByRole("button", { name: "19:30" });
    expect(slot).toHaveClass("bg-brand-primary");
    expect(slot).not.toHaveClass("bg-brand-primary-soft");
  });

  it("preselected slot updates when reopening with a different slot", () => {
    const { rerender } = render(
      <ReservationSheet {...defaultProps} open={false} preSelectedSlot="19:00" />,
    );
    rerender(
      <ReservationSheet {...defaultProps} open={true} preSelectedSlot="20:30" />,
    );
    expect(screen.getByRole("button", { name: "20:30" })).toHaveClass("bg-brand-primary");
    expect(screen.getByRole("button", { name: "19:00" })).not.toHaveClass(
      "bg-brand-primary",
    );
  });

  it('"Alege data" blocks confirm until a date is picked', async () => {
    const user = userEvent.setup();
    render(<ReservationSheet {...defaultProps} />);
    await user.click(screen.getByText("19:00"));
    await user.type(screen.getByPlaceholderText("Numele tău"), "Maria");
    await user.type(screen.getByPlaceholderText("Număr de telefon"), "712345678");
    // Activate "Alege data" — without picking a date, confirm should stay disabled.
    await user.click(screen.getByText("Alege data"));
    expect(screen.getByRole("button", { name: /confirmă/i })).toBeDisabled();
  });

  it('"Alege data" with a picked date submits that date to the API', async () => {
    const user = userEvent.setup();
    createReservationMock.mockClear();
    render(<ReservationSheet {...defaultProps} />);
    await user.click(screen.getByText("19:00"));
    await user.type(screen.getByPlaceholderText("Numele tău"), "Maria");
    await user.type(screen.getByPlaceholderText("Număr de telefon"), "712345678");
    await user.click(screen.getByText("Alege data"));
    // Simulate the native picker choosing a date 7 days from now.
    const target = new Date();
    target.setDate(target.getDate() + 7);
    const targetIso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
    const dateInput = screen.getByLabelText("Alege data rezervării") as HTMLInputElement;
    await user.clear(dateInput);
    // userEvent.type respects the date-input format on jsdom
    fireEvent.change(dateInput, { target: { value: targetIso } });
    expect(screen.getByRole("button", { name: /confirmă/i })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: /confirmă/i }));
    expect(createReservationMock).toHaveBeenCalledWith(
      expect.objectContaining({ date: targetIso }),
    );
  });

  it("shows confirmation after submit", async () => {
    const user = userEvent.setup();
    render(<ReservationSheet {...defaultProps} />);
    // Select a slot
    await user.click(screen.getByText("19:00"));
    // Fill in name and phone
    await user.type(screen.getByPlaceholderText("Numele tău"), "Maria");
    await user.type(screen.getByPlaceholderText("Număr de telefon"), "712345678");
    // Click confirm
    const confirmBtn = screen.getByRole("button", { name: /confirmă/i });
    await user.click(confirmBtn);
    // Should show confirmed state
    expect(screen.getByText("Rezervarea ta este confirmată!")).toBeInTheDocument();
  });
});
