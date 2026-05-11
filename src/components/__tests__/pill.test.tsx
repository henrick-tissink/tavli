import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pill } from "../pill";

describe("Pill", () => {
  it("renders label", () => {
    render(<Pill label="Italian" />);
    expect(screen.getByText("Italian")).toBeInTheDocument();
  });

  it("renders inactive by default", () => {
    const { container } = render(<Pill label="Italian" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill).toHaveClass("bg-surface-bg", "text-text-secondary");
  });

  it("renders active state", () => {
    const { container } = render(<Pill label="Italian" active />);
    const pill = container.firstChild as HTMLElement;
    expect(pill).toHaveClass("bg-brand-primary", "text-white");
  });

  it("shows count", () => {
    render(<Pill label="Italian" count={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows icon", () => {
    render(<Pill label="Italian" icon="🍕" />);
    expect(screen.getByText("🍕")).toBeInTheDocument();
  });

  it("shows close button when dismissible and active", () => {
    render(<Pill label="Italian" active dismissible />);
    expect(screen.getByLabelText("Remove Italian filter")).toBeInTheDocument();
  });

  it("renders as a span when non-interactive (decorative)", () => {
    const { container } = render(<Pill label="Italian" />);
    expect(container.firstChild?.nodeName).toBe("SPAN");
  });

  it("renders as a button when interactive (onToggle)", () => {
    const { container } = render(
      <Pill label="Italian" onToggle={jest.fn()} />,
    );
    expect(container.firstChild?.nodeName).toBe("BUTTON");
  });

  it("renders as a div container with two buttons when dismissible and active", () => {
    const { container } = render(<Pill label="Italian" active dismissible />);
    const root = container.firstChild as HTMLElement;
    expect(root.nodeName).toBe("DIV");
    const buttons = root.querySelectorAll("button");
    expect(buttons.length).toBe(2);
  });

  it("calls onToggle when label area clicked", async () => {
    const user = userEvent.setup();
    const handleToggle = jest.fn();
    render(<Pill label="Italian" onToggle={handleToggle} />);
    await user.click(screen.getByText("Italian"));
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it("shows dropdown indicator", () => {
    render(<Pill label="Sort" hasDropdown />);
    expect(screen.getByText("▾")).toBeInTheDocument();
  });

  it("exposes aria-pressed when interactive (onToggle provided)", () => {
    render(<Pill label="Italian" onToggle={jest.fn()} active />);
    expect(screen.getByText("Italian").closest("button")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("omits aria-pressed for decorative (no onToggle) pills", () => {
    render(<Pill label="Italian" />);
    expect(
      screen.queryByRole("button", { name: "Italian" }),
    ).not.toBeInTheDocument();
  });

  it("dismiss click does not trigger onToggle", async () => {
    const user = userEvent.setup();
    const handleToggle = jest.fn();
    const handleDismiss = jest.fn();
    render(
      <Pill
        label="Italian"
        active
        dismissible
        onToggle={handleToggle}
        onDismiss={handleDismiss}
      />
    );
    await user.click(screen.getByLabelText("Remove Italian filter"));
    expect(handleDismiss).toHaveBeenCalledTimes(1);
    expect(handleToggle).not.toHaveBeenCalled();
  });
});
