import { render, screen } from "@testing-library/react";
import { ContextBanner } from "../context-banner";

describe("ContextBanner", () => {
  it("renders greeting", () => {
    render(<ContextBanner greeting="Good evening" subtext="Find your table" />);
    expect(screen.getByText("Good evening")).toBeInTheDocument();
  });

  it("renders subtext", () => {
    render(<ContextBanner greeting="Good evening" subtext="Find your table" />);
    expect(screen.getByText("Find your table")).toBeInTheDocument();
  });

  it("greeting has correct styling", () => {
    render(<ContextBanner greeting="Good evening" subtext="Find your table" />);
    const heading = screen.getByText("Good evening");
    expect(heading).toHaveClass("font-extrabold", "text-text-primary");
  });

  it("subtext has correct styling", () => {
    render(<ContextBanner greeting="Good evening" subtext="Find your table" />);
    const sub = screen.getByText("Find your table");
    expect(sub).toHaveClass("text-sm", "text-text-secondary", "mt-1");
  });
});
