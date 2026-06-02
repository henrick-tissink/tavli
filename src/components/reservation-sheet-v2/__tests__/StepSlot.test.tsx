import { render, screen, fireEvent } from "@testing-library/react";
import { StepSlot } from "../StepSlot";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roBooking from "@/messages/ro/booking.json";

const bundle = { booking: roBooking };

function wrap(ui: React.ReactElement) {
  return render(
    <MessagesProvider locale="ro" bundle={bundle}>
      {ui}
    </MessagesProvider>,
  );
}

const slots = ["18:00", "19:00", "20:00"];

test("clicking a slot calls onSelectSlot with that value", () => {
  const onSelectSlot = jest.fn();
  wrap(
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
  wrap(
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
  wrap(
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
  wrap(
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
