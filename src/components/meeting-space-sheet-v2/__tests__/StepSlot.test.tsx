import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import enMeetingSpaces from "@/messages/en/meetingSpaces.json";
import type { MeetingSpaceTile } from "../types";

jest.mock("@/app/api/meeting-bookings/actions", () => ({
  getMeetingSpaceBusyIntervals: jest.fn().mockResolvedValue({
    ok: true,
    busy: [{ meetingSpaceId: "s1", startMinute: 600, endMinute: 660 }], // 10:00–11:00
  }),
}));
import { StepSlot } from "../StepSlot";

const SPACE: MeetingSpaceTile = {
  id: "s1",
  name: "Library Room",
  description: null,
  capacity: 8,
  hourlyRateCents: 10000,
  amenities: [],
  openTime: "09:00:00",
  closeTime: "12:00:00",
  minBookingMinutes: 60,
  photoStoragePath: null,
};

describe("meeting-space StepSlot", () => {
  it("renders free start slots for the duration, excluding busy overlaps", async () => {
    const onChange = jest.fn();
    render(
      <MessagesProvider locale="en" bundle={{ meetingSpaces: enMeetingSpaces }}>
        <StepSlot
          restaurantId="r1"
          space={SPACE}
          bookingDate="2031-05-05"
          durationMinutes={60}
          startMinute={null}
          onChange={onChange}
          onBack={() => {}}
          onNext={() => {}}
        />
      </MessagesProvider>,
    );
    // 09:00–12:00 window, 60-min duration, busy 10:00–11:00 → 09:00 and 11:00 only.
    await waitFor(() => expect(screen.getByText("09:00")).toBeInTheDocument());
    expect(screen.getByText("11:00")).toBeInTheDocument();
    expect(screen.queryByText("09:30")).not.toBeInTheDocument();
    expect(screen.queryByText("10:00")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("11:00"));
    expect(onChange).toHaveBeenCalledWith({ startMinute: 660 });
  });
});
