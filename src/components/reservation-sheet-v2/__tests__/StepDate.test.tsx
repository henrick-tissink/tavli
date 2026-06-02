import { render, screen, fireEvent } from "@testing-library/react";
import { StepDate } from "../StepDate";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roBooking from "@/messages/ro/booking.json";

const bundle = { booking: roBooking };

function renderDate(props: React.ComponentProps<typeof StepDate>) {
  return render(
    <MessagesProvider locale="ro" bundle={bundle}>
      <StepDate {...props} />
    </MessagesProvider>,
  );
}

test("StepDate calls onSelect with ISO when 'Astăzi' clicked", () => {
  const onSelect = jest.fn();
  renderDate({ value: null, onSelect });
  fireEvent.click(screen.getByRole("button", { name: /Astăzi/i }));
  expect(onSelect).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
});

test("StepDate calls onSelect with tomorrow when 'Mâine' clicked", () => {
  const onSelect = jest.fn();
  renderDate({ value: null, onSelect });
  fireEvent.click(screen.getByRole("button", { name: /Mâine/i }));
  expect(onSelect).toHaveBeenCalledTimes(1);
});
