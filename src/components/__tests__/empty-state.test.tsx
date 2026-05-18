import { render, screen } from "@testing-library/react";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("renders illustration, title, body, and optional action", () => {
    render(
      <EmptyState
        illustration="/illustrations/empty-saved.svg"
        title="Niciun loc salvat"
        body="Apasă pe inima oricărui restaurant ca să-l adaugi aici."
        action={{ label: "Descoperă restaurante", href: "/bucuresti" }}
      />,
    );
    expect(screen.getByRole("img", { name: /Niciun loc salvat/i })).toBeInTheDocument();
    expect(screen.getByText("Niciun loc salvat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Descoperă restaurante/i })).toHaveAttribute(
      "href",
      "/bucuresti",
    );
  });

  it("omits action when none provided", () => {
    render(<EmptyState illustration="/x.svg" title="Gol" body="Nimic aici." />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
