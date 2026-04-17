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

  it("calls onToggle when clicked", async () => {
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
