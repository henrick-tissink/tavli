import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeSlotPills } from "../time-slot-pills";

describe("TimeSlotPills", () => {
  const slots = ["18:00", "18:30", "19:00", "19:30", "20:00"];

  it("renders slots", () => {
    render(<TimeSlotPills slots={slots} onSelect={jest.fn()} />);
    expect(screen.getByText("18:00")).toBeInTheDocument();
    expect(screen.getByText("18:30")).toBeInTheDocument();
  });

  it("limits to maxVisible", () => {
    render(<TimeSlotPills slots={slots} maxVisible={3} onSelect={jest.fn()} />);
    expect(screen.getByText("18:00")).toBeInTheDocument();
    expect(screen.getByText("18:30")).toBeInTheDocument();
    expect(screen.getByText("19:00")).toBeInTheDocument();
    expect(screen.queryByText("19:30")).not.toBeInTheDocument();
    expect(screen.getByText(/More/)).toBeInTheDocument();
  });

  it("highlights selected slot", () => {
    render(<TimeSlotPills slots={slots} selected="19:00" onSelect={jest.fn()} />);
    const selected = screen.getByText("19:00");
    expect(selected).toHaveClass("bg-brand-primary", "text-white");
  });

  it("calls onSelect when slot clicked", async () => {
    const user = userEvent.setup();
    const handleSelect = jest.fn();
    render(<TimeSlotPills slots={slots} onSelect={handleSelect} />);
    await user.click(screen.getByText("18:30"));
    expect(handleSelect).toHaveBeenCalledWith("18:30");
  });

  it("shows empty state message", () => {
    render(<TimeSlotPills slots={[]} onSelect={jest.fn()} />);
    expect(screen.getByText("No tables tonight")).toBeInTheDocument();
    expect(screen.getByText("Try another date")).toBeInTheDocument();
  });

  it("calls onMore when More button clicked", async () => {
    const user = userEvent.setup();
    const handleMore = jest.fn();
    render(
      <TimeSlotPills
        slots={slots}
        maxVisible={3}
        onSelect={jest.fn()}
        onMore={handleMore}
      />
    );
    await user.click(screen.getByText(/More/));
    expect(handleMore).toHaveBeenCalledTimes(1);
  });
});
