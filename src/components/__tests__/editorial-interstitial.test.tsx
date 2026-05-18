import { render, screen } from "@testing-library/react";
import { EditorialInterstitial } from "../editorial-interstitial";

test("renders eyebrow, body, and optional attribution", () => {
  render(
    <EditorialInterstitial eyebrow="SEARA" body="Test pull quote" attribution="— Tavli" />
  );
  expect(screen.getByText("SEARA")).toBeInTheDocument();
  expect(screen.getByText("Test pull quote")).toBeInTheDocument();
  expect(screen.getByText("— Tavli")).toBeInTheDocument();
});

test("renders without optional eyebrow and attribution", () => {
  render(<EditorialInterstitial body="Only the body text" />);
  expect(screen.getByText("Only the body text")).toBeInTheDocument();
});
