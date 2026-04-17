import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabBar } from "../tab-bar";

describe("TabBar", () => {
  it("renders 5 tabs", () => {
    render(<TabBar activeTab="discover" onTabChange={jest.fn()} />);
    expect(screen.getByLabelText("Discover")).toBeInTheDocument();
    expect(screen.getByLabelText("Map")).toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(screen.getByLabelText("Saved")).toBeInTheDocument();
    expect(screen.getByLabelText("Profile")).toBeInTheDocument();
  });

  it("highlights active tab", () => {
    render(<TabBar activeTab="discover" onTabChange={jest.fn()} />);
    const discoverBtn = screen.getByLabelText("Discover");
    expect(discoverBtn).toHaveClass("text-brand-primary");
  });

  it("inactive tabs have muted color", () => {
    render(<TabBar activeTab="discover" onTabChange={jest.fn()} />);
    const mapBtn = screen.getByLabelText("Map");
    expect(mapBtn).toHaveClass("text-text-muted");
  });

  it("calls onTabChange when clicked", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    render(<TabBar activeTab="discover" onTabChange={handleChange} />);
    await user.click(screen.getByLabelText("Map"));
    expect(handleChange).toHaveBeenCalledWith("map");
  });

  it("has accessible labels", () => {
    render(<TabBar activeTab="discover" onTabChange={jest.fn()} />);
    const nav = screen.getByRole("navigation");
    expect(nav).toHaveAttribute("aria-label", "Main navigation");
  });
});
