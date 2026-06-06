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

test("StepParty never offers a pill above a small floor's cap", () => {
  const onChange = jest.fn();
  const { rerender } = renderParty({ value: 2, onChange, max: 6 });
  // The standard '8' shortcut must NOT render — it exceeds the cap of 6.
  expect(screen.queryByRole("button", { name: /^8$/ })).toBeNull();
  expect(screen.getByRole("button", { name: /^6$/ })).toBeVisible();
  // At the cap, + can't push past it.
  rerender(
    <MessagesProvider locale="ro" bundle={bundle}>
      <StepParty value={6} onChange={onChange} max={6} />
    </MessagesProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Adaugă invitat/i }));
  expect(onChange).not.toHaveBeenCalled();
});

test("StepParty exposes the combinable range when the floor plan seats more than 12", () => {
  const onChange = jest.fn();
  const { rerender } = renderParty({ value: 12, onChange, max: 22 });

  // 12 is below the combinable ceiling now → increment allowed, no event hint.
  fireEvent.click(screen.getByRole("button", { name: /Adaugă invitat/i }));
  expect(onChange).toHaveBeenCalledWith(13);
  expect(screen.queryByText(/evenimentele private/i)).toBeNull();

  // The ceiling is offered as a one-tap pill.
  fireEvent.click(screen.getByRole("button", { name: /^22$/ }));
  expect(onChange).toHaveBeenCalledWith(22);

  // At the ceiling the increment is capped and the private-event hint returns.
  onChange.mockClear();
  rerender(
    <MessagesProvider locale="ro" bundle={bundle}>
      <StepParty value={22} onChange={onChange} max={22} />
    </MessagesProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Adaugă invitat/i }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText(/evenimentele private/i)).toBeVisible();
});
