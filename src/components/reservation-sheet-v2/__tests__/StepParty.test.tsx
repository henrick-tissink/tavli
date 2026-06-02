import { render, screen, fireEvent } from "@testing-library/react";
import { StepParty } from "../StepParty";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roBooking from "@/messages/ro/booking.json";

const bundle = { booking: roBooking };

function renderParty(props: React.ComponentProps<typeof StepParty>) {
  return render(
    <MessagesProvider locale="ro" bundle={bundle}>
      <StepParty {...props} />
    </MessagesProvider>,
  );
}

test("StepParty +/- adjust within 1-12 range; pills set exact value", () => {
  const onChange = jest.fn();
  const { rerender } = renderParty({ value: 2, onChange });
  fireEvent.click(screen.getByRole("button", { name: /Adaugă invitat/i }));
  expect(onChange).toHaveBeenCalledWith(3);

  onChange.mockClear();
  rerender(
    <MessagesProvider locale="ro" bundle={bundle}>
      <StepParty value={2} onChange={onChange} />
    </MessagesProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^6$/ }));
  expect(onChange).toHaveBeenCalledWith(6);
});

test("StepParty clamps at 1 on minus, shows event hint at 12", () => {
  const onChange = jest.fn();
  const { rerender } = renderParty({ value: 1, onChange });
  fireEvent.click(screen.getByRole("button", { name: /Scade invitat/i }));
  expect(onChange).not.toHaveBeenCalled();

  rerender(
    <MessagesProvider locale="ro" bundle={bundle}>
      <StepParty value={12} onChange={onChange} />
    </MessagesProvider>,
  );
  expect(screen.getByText(/evenimentele private/i)).toBeVisible();
});
