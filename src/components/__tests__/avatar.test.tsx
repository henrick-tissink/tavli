import { render, screen } from "@testing-library/react";
import { Avatar } from "../avatar";

describe("Avatar", () => {
  it("renders initials", () => {
    render(<Avatar name="Alice" />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("has deterministic color (same name = same color)", () => {
    const { container: c1 } = render(<Avatar name="Bob" />);
    const { container: c2 } = render(<Avatar name="Bob" />);
    const style1 = (c1.firstChild as HTMLElement).style.backgroundColor;
    const style2 = (c2.firstChild as HTMLElement).style.backgroundColor;
    expect(style1).toBe(style2);
  });

  it("different names can produce different colors", () => {
    const { container: c1 } = render(<Avatar name="Alice" />);
    const { container: c2 } = render(<Avatar name="Bob" />);
    const style1 = (c1.firstChild as HTMLElement).style.backgroundColor;
    const style2 = (c2.firstChild as HTMLElement).style.backgroundColor;
    expect(style1).not.toBe(style2);
  });

  it("renders default (md) size", () => {
    const { container } = render(<Avatar name="Alice" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("w-10", "h-10", "text-sm");
  });

  it("renders small size", () => {
    const { container } = render(<Avatar name="Alice" size="sm" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("w-7", "h-7", "text-xs");
  });

  it("renders large size", () => {
    const { container } = render(<Avatar name="Alice" size="lg" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("w-14", "h-14", "text-lg");
  });
});
