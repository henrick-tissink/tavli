import { render, screen, fireEvent } from "@testing-library/react";
import { StepDate } from "../StepDate";

test("StepDate calls onSelect with ISO when 'Astăzi' clicked", () => {
  const onSelect = jest.fn();
  render(<StepDate value={null} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: /Astăzi/i }));
  expect(onSelect).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
});

test("StepDate calls onSelect with tomorrow when 'Mâine' clicked", () => {
  const onSelect = jest.fn();
  render(<StepDate value={null} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: /Mâine/i }));
  expect(onSelect).toHaveBeenCalledTimes(1);
});
