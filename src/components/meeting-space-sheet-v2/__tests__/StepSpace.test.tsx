import { render, screen, fireEvent } from "@testing-library/react";
import { StepSpace } from "../StepSpace";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import enMeetingSpaces from "@/messages/en/meetingSpaces.json";
import type { MeetingSpaceTile } from "../types";

const SPACES: MeetingSpaceTile[] = [
  {
    id: "s1",
    name: "Library Room",
    description: "Quiet room",
    capacity: 8,
    hourlyRateCents: 10000,
    amenities: ["screen"],
    openTime: "09:00:00",
    closeTime: "18:00:00",
    minBookingMinutes: 60,
    photoStoragePath: null,
  },
  {
    id: "s2",
    name: "Garden Nook",
    description: null,
    capacity: 4,
    hourlyRateCents: 0,
    amenities: [],
    openTime: "10:00:00",
    closeTime: "16:00:00",
    minBookingMinutes: 30,
    photoStoragePath: null,
  },
];

function renderStep(onPick = jest.fn(), onNext = jest.fn()) {
  render(
    <MessagesProvider locale="en" bundle={{ meetingSpaces: enMeetingSpaces }}>
      <StepSpace spaces={SPACES} selectedId={null} onPick={onPick} onBack={() => {}} onNext={onNext} />
    </MessagesProvider>,
  );
  return { onPick, onNext };
}

describe("meeting-space StepSpace", () => {
  it("renders a tile per space with capacity and rate", () => {
    renderStep();
    expect(screen.getByText("Library Room")).toBeInTheDocument();
    expect(screen.getByText("Garden Nook")).toBeInTheDocument();
    expect(screen.getByText(/100 lei\/h/)).toBeInTheDocument();
    expect(screen.getByText(/8 seats/)).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument(); // 0-rate space
  });

  it("picks a space on click", () => {
    const { onPick } = renderStep();
    fireEvent.click(screen.getByText("Library Room"));
    expect(onPick).toHaveBeenCalledWith("s1");
  });
});
