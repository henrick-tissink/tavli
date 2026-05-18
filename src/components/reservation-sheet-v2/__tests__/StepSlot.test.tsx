import { render, screen, fireEvent } from "@testing-library/react";
import { StepSlot } from "../StepSlot";

const slots = ["18:00", "19:00", "20:00"];

test("clicking a slot calls onSelectSlot with that value", () => {
  const onSelectSlot = jest.fn();
  render(
    <StepSlot
      availableSlots={slots}
      selectedSlot={null}
      selectedZone={null}
      onSelectSlot={onSelectSlot}
      onSelectZone={jest.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "19:00" }));
  expect(onSelectSlot).toHaveBeenCalledWith("19:00");
});

test("selected slot has aria-pressed=true", () => {
  render(
    <StepSlot
      availableSlots={slots}
      selectedSlot="19:00"
      selectedZone={null}
      onSelectSlot={jest.fn()}
      onSelectZone={jest.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "19:00", pressed: true })).toBeInTheDocument();
});

test("zone chips render and selecting a zone calls onSelectZone", () => {
  const onSelectZone = jest.fn();
  render(
    <StepSlot
      availableSlots={slots}
      zones={["Terasă", "Interior"]}
      selectedSlot={null}
      selectedZone={null}
      onSelectSlot={jest.fn()}
      onSelectZone={onSelectZone}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Terasă/i }));
  expect(onSelectZone).toHaveBeenCalledWith("Terasă");
});

test("empty availableSlots shows empty-state copy", () => {
  render(
    <StepSlot
      availableSlots={[]}
      selectedSlot={null}
      selectedZone={null}
      onSelectSlot={jest.fn()}
      onSelectZone={jest.fn()}
    />,
  );
  expect(screen.getByText(/Nu sunt locuri disponibile/i)).toBeInTheDocument();
});
