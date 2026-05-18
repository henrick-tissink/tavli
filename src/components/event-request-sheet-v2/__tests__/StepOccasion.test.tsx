import { render, screen, fireEvent } from "@testing-library/react";
import { StepOccasion } from "../StepOccasion";

describe("StepOccasion", () => {
  it("renders one card per accepted occasion and calls onPick when clicked", () => {
    const onPick = jest.fn();
    render(
      <StepOccasion
        acceptedOccasions={["wedding", "birthday"]}
        selected={null}
        onPick={onPick}
        onNext={() => {}}
      />,
    );
    expect(screen.getByText(/nuntă/i)).toBeInTheDocument();
    expect(screen.getByText(/aniversare/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/nuntă/i));
    expect(onPick).toHaveBeenCalledWith("wedding");
  });

  it("disables Continuă until an occasion is selected", () => {
    const { rerender } = render(
      <StepOccasion
        acceptedOccasions={["wedding"]}
        selected={null}
        onPick={() => {}}
        onNext={() => {}}
      />,
    );
    const cta = screen.getByRole("button", { name: /continuă/i });
    expect(cta).toBeDisabled();

    rerender(
      <StepOccasion
        acceptedOccasions={["wedding"]}
        selected="wedding"
        onPick={() => {}}
        onNext={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /continuă/i })).toBeEnabled();
  });
});
