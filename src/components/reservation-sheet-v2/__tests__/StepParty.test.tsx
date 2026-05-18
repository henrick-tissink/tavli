import { render, screen, fireEvent } from "@testing-library/react";
import { StepParty } from "../StepParty";

test("StepParty +/- adjust within 1-12 range; pills set exact value", () => {
  const onChange = jest.fn();
  const { rerender } = render(<StepParty value={2} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /Adaugă invitat/i }));
  expect(onChange).toHaveBeenCalledWith(3);

  onChange.mockClear();
  rerender(<StepParty value={2} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /^6$/ }));
  expect(onChange).toHaveBeenCalledWith(6);
});

test("StepParty clamps at 1 on minus, shows event hint at 12", () => {
  const onChange = jest.fn();
  const { rerender } = render(<StepParty value={1} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /Scade invitat/i }));
  expect(onChange).not.toHaveBeenCalled();

  rerender(<StepParty value={12} onChange={onChange} />);
  expect(screen.getByText(/evenimentele private/i)).toBeVisible();
});
