import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabBar } from "../tab-bar";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roDiscovery from "@/messages/ro/discovery.json";

function renderWithProvider(ui: React.ReactElement) {
  return render(
    <MessagesProvider locale="ro" bundle={{ discovery: roDiscovery }}>
      {ui}
    </MessagesProvider>,
  );
}

describe("TabBar", () => {
  it("renders 5 tabs", () => {
    renderWithProvider(<TabBar activeTab="discover" onTabChange={jest.fn()} />);
    expect(screen.getByLabelText("Descoperă")).toBeInTheDocument();
    expect(screen.getByLabelText("Hartă")).toBeInTheDocument();
    expect(screen.getByLabelText("Caută")).toBeInTheDocument();
    expect(screen.getByLabelText("Salvate")).toBeInTheDocument();
    expect(screen.getByLabelText("Profil")).toBeInTheDocument();
  });

  it("highlights active tab", () => {
    renderWithProvider(<TabBar activeTab="discover" onTabChange={jest.fn()} />);
    const discoverBtn = screen.getByLabelText("Descoperă");
    expect(discoverBtn).toHaveClass("text-brand-primary");
  });

  it("inactive tabs have muted color", () => {
    renderWithProvider(<TabBar activeTab="discover" onTabChange={jest.fn()} />);
    const mapBtn = screen.getByLabelText("Hartă");
    expect(mapBtn).toHaveClass("text-text-muted");
  });

  it("calls onTabChange when clicked", async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    renderWithProvider(<TabBar activeTab="discover" onTabChange={handleChange} />);
    await user.click(screen.getByLabelText("Hartă"));
    expect(handleChange).toHaveBeenCalledWith("map");
  });

  it("has accessible labels", () => {
    renderWithProvider(<TabBar activeTab="discover" onTabChange={jest.fn()} />);
    const nav = screen.getByRole("navigation");
    expect(nav).toHaveAttribute("aria-label", "Navigare principală");
  });
});
