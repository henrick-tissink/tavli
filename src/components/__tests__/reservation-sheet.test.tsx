import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Phone number")).toBeInTheDocument();
  });

  it("confirm button is disabled without name and phone", async () => {
    const user = userEvent.setup();
    render(<ReservationSheet {...defaultProps} />);
    await user.click(screen.getByText("19:00"));
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("shows confirmation after submit", async () => {
    const user = userEvent.setup();
    render(<ReservationSheet {...defaultProps} />);
    // Select a slot
    await user.click(screen.getByText("19:00"));
    // Fill in name and phone
    await user.type(screen.getByPlaceholderText("Your name"), "Maria");
    await user.type(screen.getByPlaceholderText("Phone number"), "712345678");
    // Click confirm
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    await user.click(confirmBtn);
    // Should show confirmed state
    expect(screen.getByText("You're booked!")).toBeInTheDocument();
  });
});
