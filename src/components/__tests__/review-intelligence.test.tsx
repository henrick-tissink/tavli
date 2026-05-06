import { render, screen } from "@testing-library/react";
import { ReviewIntelligenceSection } from "../review-intelligence";
import type { ReviewIntelligence } from "@/lib/types";

const intelligence: ReviewIntelligence = {
  dimensions: [
    { label: "Food", icon: "🍽️", percent: 92, mentionCount: 187 },
    { label: "Service", icon: "🤝", percent: 88, mentionCount: 154 },
    { label: "Atmosphere", icon: "✨", percent: 85, mentionCount: 132 },
    { label: "Value", icon: "💰", percent: 79, mentionCount: 98 },
  ],
  topMentions: [
    { phrase: "fresh ingredients", count: 47 },
    { phrase: "friendly staff", count: 38 },
    { phrase: "cozy atmosphere", count: 31 },
  ],
  bestFor: ["Date night", "Business lunch", "Group dining"],
};

describe("ReviewIntelligenceSection", () => {
  it("renders dimension bars", () => {
    render(<ReviewIntelligenceSection intelligence={intelligence} totalReviews={312} />);
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("Service")).toBeInTheDocument();
    expect(screen.getByText("Atmosphere")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
  });

  it("renders top mentions", () => {
    render(<ReviewIntelligenceSection intelligence={intelligence} totalReviews={312} />);
    expect(screen.getByText(/fresh ingredients/)).toBeInTheDocument();
    expect(screen.getByText(/friendly staff/)).toBeInTheDocument();
    expect(screen.getByText(/cozy atmosphere/)).toBeInTheDocument();
  });

  it("renders bestFor pills", () => {
    render(<ReviewIntelligenceSection intelligence={intelligence} totalReviews={312} />);
    expect(screen.getByText("Date night")).toBeInTheDocument();
    expect(screen.getByText("Business lunch")).toBeInTheDocument();
    expect(screen.getByText("Group dining")).toBeInTheDocument();
  });

  it("renders total review count", () => {
    render(<ReviewIntelligenceSection intelligence={intelligence} totalReviews={312} />);
    expect(screen.getByText("Pe baza a 312 recenzii")).toBeInTheDocument();
  });
});
