import { render, screen } from "@testing-library/react";
import { StatusTimeline } from "../StatusTimeline";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roEvents from "@/messages/ro/events.json";

function renderTimeline(status: string) {
  return render(
    <MessagesProvider locale="ro" bundle={{ events: roEvents }}>
      <StatusTimeline status={status} />
    </MessagesProvider>,
  );
}

describe("StatusTimeline", () => {
  it("marks Submitted/Viewing as past and Quoted as current when status='quoted'", () => {
    renderTimeline("quoted");
    expect(screen.getByText("Trimisă").closest("li")).toHaveAttribute(
      "data-state",
      "past",
    );
    expect(screen.getByText("Vizualizată").closest("li")).toHaveAttribute(
      "data-state",
      "past",
    );
    expect(screen.getByText("Ofertă").closest("li")).toHaveAttribute(
      "data-state",
      "current",
    );
    expect(screen.getByText("Decizie").closest("li")).toHaveAttribute(
      "data-state",
      "future",
    );
  });
});
