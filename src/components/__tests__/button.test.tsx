import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../button";

describe("Button", () => {
  it("renders with label", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("renders primary variant by default with shadow-card", () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("bg-brand-primary", "text-white", "shadow-card");
  });

  it("renders secondary variant without shadow-card", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("bg-brand-primary-soft", "text-brand-primary-dark");
    expect(btn).not.toHaveClass("shadow-card");
  });

  it("renders ghost variant with border", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("bg-transparent", "text-text-secondary", "border", "border-border");
  });

  it("renders fullWidth", () => {
    render(<Button fullWidth>Wide</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("w-full");
  });

  it("is disabled when disabled", () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveClass("opacity-50", "cursor-not-allowed");
  });

  it("disabled button does not have active:scale class", () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).not.toContain("active:scale");
  });

  it("is disabled and marked busy while loading", () => {
    render(<Button loading>Saving…</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveClass("opacity-50", "cursor-not-allowed");
  });

  it("keeps the label visible while loading", () => {
    // The reduced-motion guard in globals.css freezes the spinner, so the text
    // is the only remaining cue for those users.
    render(<Button loading>Saving…</Button>);
    expect(screen.getByRole("button", { name: /Saving/ })).toBeInTheDocument();
  });

  it("does not fire onClick while loading", async () => {
    // pointer-events-none is part of the disabled styling, so the default
    // pointer-events assertion would throw before the click is attempted.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const handleClick = jest.fn();
    render(
      <Button loading onClick={handleClick}>
        Saving…
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("is not busy when idle", () => {
    render(<Button>Idle</Button>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });

  it("calls onClick handler", async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
