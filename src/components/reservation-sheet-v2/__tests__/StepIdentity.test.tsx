import { render, screen, fireEvent } from "@testing-library/react";
import { StepIdentity } from "../StepIdentity";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roBooking from "@/messages/ro/booking.json";

const bundle = { booking: roBooking };

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
    occasion: "" as const,
    occasionDate: "",
    onChange: jest.fn(),
    errors: {},
    ...overrides,
  };
}

function renderIdentity(props: React.ComponentProps<typeof StepIdentity>) {
  return render(
    <MessagesProvider locale="ro" bundle={bundle}>
      <StepIdentity {...props} />
    </MessagesProvider>,
  );
}

test("selecting a birthday occasion reveals a date field + calls onChange", () => {
  const onChange = jest.fn();
  renderIdentity(makeProps({ occasion: "birthday", onChange }));
  expect(screen.getByLabelText(/Data nașterii/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Sărbătorești ceva/i), { target: { value: "anniversary" } });
  expect(onChange).toHaveBeenCalledWith("occasion", "anniversary");
});

test("preview card shows formatted summary", () => {
  renderIdentity(makeProps());
  // Romanian formatter would yield "luni, 18 mai" or similar; just confirm the time + guests
  expect(screen.getByText(/19:30/)).toBeInTheDocument();
  expect(screen.getByText(/4 persoane/)).toBeInTheDocument();
});

test("notes char counter updates and respects 280 max", () => {
  renderIdentity(makeProps({ notes: "Cu fereastră" }));
  expect(screen.getByText("12 / 280")).toBeInTheDocument();
  expect(screen.getByLabelText(/Note/i)).toHaveAttribute("maxLength", "280");
});

test("changing name calls onChange('name', value)", () => {
  const onChange = jest.fn();
  renderIdentity(makeProps({ onChange }));
  fireEvent.change(screen.getByLabelText(/Nume/i), { target: { value: "Ana" } });
  expect(onChange).toHaveBeenCalledWith("name", "Ana");
});

test("renders error for invalid field", () => {
  renderIdentity(makeProps({ errors: { email: "Email invalid" } }));
  expect(screen.getByText("Email invalid")).toBeInTheDocument();
});
