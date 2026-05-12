import { render, screen } from "@testing-library/react";
import { Placeholder } from "../placeholder";

describe("<Placeholder>", () => {
  it("renders the value plainly when NODE_ENV is production", () => {
    const original = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    });

    render(<Placeholder name="name" />);
    const el = screen.getByText(/ENTITY NAME — TBD/);
    expect(el).toBeInTheDocument();
    expect(el).not.toHaveClass("border-dashed");

    Object.defineProperty(process.env, "NODE_ENV", {
      value: original,
      configurable: true,
    });
  });

  it("renders the value in a dashed-orange box in development", () => {
    const original = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    });

    const { container } = render(<Placeholder name="name" />);
    const box = container.querySelector(".border-dashed");
    expect(box).not.toBeNull();
    expect(box).toHaveTextContent(/ENTITY NAME — TBD/);
    expect(box).toHaveTextContent("PLACEHOLDER");

    Object.defineProperty(process.env, "NODE_ENV", {
      value: original,
      configurable: true,
    });
  });
});
