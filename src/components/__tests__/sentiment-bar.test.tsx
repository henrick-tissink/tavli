import { render, screen } from "@testing-library/react";
import { SentimentBar } from "../sentiment-bar";

describe("SentimentBar", () => {
  it("renders label", () => {
    render(<SentimentBar icon="🍽️" label="Food" percent={92} mentionCount={187} />);
    expect(screen.getByText("Food")).toBeInTheDocument();
  });

  it("renders percent number", () => {
    render(<SentimentBar icon="🍽️" label="Food" percent={92} mentionCount={187} />);
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("bar inner width matches percent", () => {
    render(<SentimentBar icon="🍽️" label="Food" percent={85} mentionCount={150} />);
    const bar = screen.getByTestId("sentiment-bar-fill");
    expect(bar.style.width).toBe("85%");
  });
});
