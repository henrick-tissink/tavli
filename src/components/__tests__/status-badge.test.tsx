import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../status-badge";

describe("StatusBadge", () => {
  it("renders 'Open' for open status (full)", () => {
    render(<StatusBadge status="open" />);
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("shows closing time when provided", () => {
    render(<StatusBadge status="open" closesAt="22:00" />);
    expect(screen.getByText(/Closes at 22:00/)).toBeInTheDocument();
  });

  it("renders 'Closed' for closed status", () => {
    render(<StatusBadge status="closed" />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("shows opening time when provided", () => {
    render(<StatusBadge status="closed" opensAt="11:00" />);
    expect(screen.getByText(/Opens at 11:00/)).toBeInTheDocument();
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
    expect(screen.queryByText(/Closes at/)).not.toBeInTheDocument();
  });

  it("compact open has correct classes", () => {
    const { container } = render(<StatusBadge status="open" variant="compact" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("text-success", "rounded-pill", "px-2", "py-0.5");
  });
});
