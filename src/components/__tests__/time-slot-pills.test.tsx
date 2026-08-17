import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { TimeSlotPills } from "../time-slot-pills";
import { freezeClock, unfreezeClock } from "@/test-support/clock";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roBooking from "@/messages/ro/booking.json";

// TimeSlotPills reads useT("booking") for the more / another-day labels.
function render(ui: ReactElement) {
  return rtlRender(
    <MessagesProvider locale="ro" bundle={{ booking: roBooking }}>
      {ui}
    </MessagesProvider>,
  );
}

describe("TimeSlotPills", () => {
  const slots = ["18:00", "18:30", "19:00", "19:30", "20:00"];
  // Freeze to morning so the components' wall-clock past-slot filter keeps every
  // evening test slot — makes these render/limit/select assertions deterministic.
  beforeEach(() => freezeClock());
  afterEach(() => unfreezeClock());

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
    expect(screen.getByText(/Mai multe/)).toBeInTheDocument();
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
    expect(screen.getByText(/Rezervă pentru altă zi/)).toBeInTheDocument();
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
    await user.click(screen.getByText(/Mai multe/));
    expect(handleMore).toHaveBeenCalledTimes(1);
  });

  // A slot that NAVIGATES is a link; a slot that opens the booking sheet in
  // place is an action and stays a button. Getting this backwards either makes
  // the deep-links uncrawlable again, or puts a bogus href on a sheet trigger.
  describe("link vs button", () => {
    it("renders anchors with the booking deep-link when hrefForSlot is given", () => {
      render(
        <TimeSlotPills
          slots={["19:00", "19:30"]}
          hrefForSlot={(slot) => `/bucuresti/la-mama?date=2026-08-16&time=${slot}`}
        />,
      );
      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute("href", "/bucuresti/la-mama?date=2026-08-16&time=19:00");
      expect(screen.queryAllByRole("button")).toHaveLength(0);
    });

    it("stays buttons when no href is given (venue page opens a sheet)", () => {
      render(<TimeSlotPills slots={["19:00", "19:30"]} onSelect={jest.fn()} />);
      expect(screen.getAllByRole("button")).toHaveLength(2);
      expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

  });
});
