import { render, screen, fireEvent } from "@testing-library/react";
import { StepIdentity } from "../StepIdentity";

function makeProps(overrides = {}) {
  return {
    date: "2026-05-18",
    slot: "19:30",
    guests: 4,
    zone: null,
    name: "",
    phone: "",
    email: "",
    notes: "",
    onChange: jest.fn(),
    errors: {},
    ...overrides,
  };
}

test("preview card shows formatted summary", () => {
  render(<StepIdentity {...makeProps()} />);
  // Romanian formatter would yield "luni, 18 mai" or similar; just confirm the time + guests
  expect(screen.getByText(/19:30/)).toBeInTheDocument();
  expect(screen.getByText(/4 persoane/)).toBeInTheDocument();
});

test("notes char counter updates and respects 280 max", () => {
  render(<StepIdentity {...makeProps({ notes: "Cu fereastră" })} />);
  expect(screen.getByText("12 / 280")).toBeInTheDocument();
  expect(screen.getByLabelText(/Note/i)).toHaveAttribute("maxLength", "280");
});

test("changing name calls onChange('name', value)", () => {
  const onChange = jest.fn();
  render(<StepIdentity {...makeProps({ onChange })} />);
  fireEvent.change(screen.getByLabelText(/Nume/i), { target: { value: "Ana" } });
  expect(onChange).toHaveBeenCalledWith("name", "Ana");
});

test("renders error for invalid field", () => {
  render(<StepIdentity {...makeProps({ errors: { email: "Email invalid" } })} />);
  expect(screen.getByText("Email invalid")).toBeInTheDocument();
});
