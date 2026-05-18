import { render, screen } from "@testing-library/react";
import { StatusTimeline } from "../StatusTimeline";

describe("StatusTimeline", () => {
  it("marks Submitted/Viewing as past and Quoted as current when status='quoted'", () => {
    render(<StatusTimeline status="quoted" />);
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
