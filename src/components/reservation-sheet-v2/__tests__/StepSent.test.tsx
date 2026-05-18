import { render, screen, fireEvent } from "@testing-library/react";
import { StepSent } from "../StepSent";

test("renders confirmation copy and triggers onClose", () => {
  const onClose = jest.fn();
  render(
    <StepSent
      restaurantName="Caru' cu Bere"
      date="2026-05-18"
      slot="19:30"
      guests={4}
      onClose={onClose}
    />,
  );
  expect(screen.getByText(/Rezervarea ta este confirmată/i)).toBeInTheDocument();
  expect(screen.getByText(/Caru' cu Bere/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Înapoi/i }));
  expect(onClose).toHaveBeenCalled();
});

test("renders 'Vezi rezervarea' link when confirmationToken is provided", () => {
  render(
    <StepSent
      restaurantName="Caru' cu Bere"
      date="2026-05-18"
      slot="19:30"
      guests={4}
      confirmationToken="tok-abc123"
      onClose={jest.fn()}
    />,
  );
  expect(screen.getByRole("link", { name: /Vezi rezervarea/i })).toHaveAttribute(
    "href",
    "/reservations/tok-abc123",
  );
});

test("does not render 'Vezi rezervarea' link when confirmationToken is absent", () => {
  render(
    <StepSent
      restaurantName="Caru' cu Bere"
      date="2026-05-18"
      slot="19:30"
      guests={4}
      onClose={jest.fn()}
    />,
  );
  expect(screen.queryByRole("link", { name: /Vezi rezervarea/i })).not.toBeInTheDocument();
});
