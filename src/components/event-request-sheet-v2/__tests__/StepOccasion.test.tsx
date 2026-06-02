import { render, screen, fireEvent } from "@testing-library/react";
import { StepOccasion } from "../StepOccasion";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roEvents from "@/messages/ro/events.json";

function renderStep(selected: "wedding" | "birthday" | null = null) {
  return render(
    <MessagesProvider locale="ro" bundle={{ events: roEvents }}>
      <StepOccasion
        acceptedOccasions={["wedding", "birthday"]}
        selected={selected}
        onPick={jest.fn()}
        onNext={() => {}}
      />
    </MessagesProvider>,
  );
}

describe("StepOccasion", () => {
  it("renders one card per accepted occasion and calls onPick when clicked", () => {
    const onPick = jest.fn();
    render(
      <MessagesProvider locale="ro" bundle={{ events: roEvents }}>
        <StepOccasion
          acceptedOccasions={["wedding", "birthday"]}
          selected={null}
          onPick={onPick}
          onNext={() => {}}
        />
      </MessagesProvider>,
    );
    expect(screen.getByText(/nuntă/i)).toBeInTheDocument();
    expect(screen.getByText(/aniversare/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/nuntă/i));
    expect(onPick).toHaveBeenCalledWith("wedding");
  });

  it("disables Continuă until an occasion is selected", () => {
    const { rerender } = renderStep(null);
    const cta = screen.getByRole("button", { name: /continuă/i });
    expect(cta).toBeDisabled();

    rerender(
      <MessagesProvider locale="ro" bundle={{ events: roEvents }}>
        <StepOccasion
          acceptedOccasions={["wedding"]}
          selected="wedding"
          onPick={() => {}}
          onNext={() => {}}
        />
      </MessagesProvider>,
    );
    expect(screen.getByRole("button", { name: /continuă/i })).toBeEnabled();
  });
});
