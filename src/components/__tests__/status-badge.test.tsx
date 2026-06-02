import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { StatusBadge } from "../status-badge";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roUi from "@/messages/ro/ui.json";

// StatusBadge reads useT("ui") for its open/closed labels.
function render(ui: ReactElement) {
  return rtlRender(
    <MessagesProvider locale="ro" bundle={{ ui: roUi }}>
      {ui}
    </MessagesProvider>,
  );
}

describe("StatusBadge", () => {
  it("renders 'Deschis acum' for open status (full)", () => {
    render(<StatusBadge status="open" />);
    expect(screen.getByText("Deschis acum")).toBeInTheDocument();
  });

  it("shows closing time when provided", () => {
    render(<StatusBadge status="open" closesAt="22:00" />);
    expect(screen.getByText(/Se închide la 22:00/)).toBeInTheDocument();
  });

  it("renders 'Închis' for closed status", () => {
    render(<StatusBadge status="closed" />);
    expect(screen.getByText("Închis")).toBeInTheDocument();
  });

  it("shows opening time when provided", () => {
    render(<StatusBadge status="closed" opensAt="11:00" />);
    expect(screen.getByText(/Se deschide la 11:00/)).toBeInTheDocument();
  });

  it("uses green color for open", () => {
    const { container } = render(<StatusBadge status="open" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("text-success");
  });

  it("uses red color for closed", () => {
    const { container } = render(<StatusBadge status="closed" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("text-error");
  });

  it("compact variant does not show time", () => {
    render(<StatusBadge status="open" closesAt="22:00" variant="compact" />);
    expect(screen.queryByText(/Se închide la/)).not.toBeInTheDocument();
  });

  it("compact open has correct classes", () => {
    const { container } = render(<StatusBadge status="open" variant="compact" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("text-success", "rounded-pill", "px-2", "py-0.5");
  });
});
