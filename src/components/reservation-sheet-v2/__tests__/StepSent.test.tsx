import { render, screen, fireEvent } from "@testing-library/react";
import { StepSent } from "../StepSent";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roBooking from "@/messages/ro/booking.json";

const bundle = { booking: roBooking };

function renderSent(props: React.ComponentProps<typeof StepSent>) {
  return render(
    <MessagesProvider locale="ro" bundle={bundle}>
      <StepSent {...props} />
    </MessagesProvider>,
  );
}

test("renders confirmation copy and triggers onClose", () => {
  const onClose = jest.fn();
  renderSent({
    restaurantName: "Caru' cu Bere",
    date: "2026-05-18",
    slot: "19:30",
    guests: 4,
    onClose,
  });
  expect(screen.getByText(/Rezervarea ta este confirmată/i)).toBeInTheDocument();
  expect(screen.getByText(/Caru' cu Bere/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Înapoi/i }));
  expect(onClose).toHaveBeenCalled();
});

test("renders 'Vezi rezervarea' link when confirmationToken is provided", () => {
  renderSent({
    restaurantName: "Caru' cu Bere",
    date: "2026-05-18",
    slot: "19:30",
    guests: 4,
    confirmationToken: "tok-abc123",
    onClose: jest.fn(),
  });
  expect(screen.getByRole("link", { name: /Vezi rezervarea/i })).toHaveAttribute(
    "href",
    "/reservations/tok-abc123",
  );
});

test("does not render 'Vezi rezervarea' link when confirmationToken is absent", () => {
  renderSent({
    restaurantName: "Caru' cu Bere",
    date: "2026-05-18",
    slot: "19:30",
    guests: 4,
    onClose: jest.fn(),
  });
  expect(screen.queryByRole("link", { name: /Vezi rezervarea/i })).not.toBeInTheDocument();
});
