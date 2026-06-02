import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CitySelector } from "../city-selector";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { buildBundle } from "@/lib/i18n/messages";

function renderSelector(props: React.ComponentProps<typeof CitySelector>) {
  const bundle = buildBundle("ro", ["profile"]);
  return render(
    <MessagesProvider locale="ro" bundle={bundle}>
      <CitySelector {...props} />
    </MessagesProvider>
  );
}

describe("CitySelector", () => {
  it("renders current city", () => {
    renderSelector({ currentCity: "București", onSelect: jest.fn() });
    expect(screen.getByText("București")).toBeInTheDocument();
  });

  it("opens dropdown on click", async () => {
    const user = userEvent.setup();
    renderSelector({ currentCity: "București", onSelect: jest.fn() });
    await user.click(screen.getByLabelText("Alege orașul"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("shows all cities", async () => {
    const user = userEvent.setup();
    renderSelector({ currentCity: "București", onSelect: jest.fn() });
    await user.click(screen.getByLabelText("Alege orașul"));
    expect(screen.getByText("Cluj")).toBeInTheDocument();
    expect(screen.getByText("Timișoara")).toBeInTheDocument();
    expect(screen.getByText("Brașov")).toBeInTheDocument();
    expect(screen.getByText("Iași")).toBeInTheDocument();
  });

  it("calls onSelect for active city", async () => {
    const user = userEvent.setup();
    const handleSelect = jest.fn();
    renderSelector({ currentCity: "București", onSelect: handleSelect });
    await user.click(screen.getByLabelText("Alege orașul"));
    // București is the only active city - click its button
    const bucurestiButtons = screen.getAllByText("București");
    // The second one is inside the dropdown
    await user.click(bucurestiButtons[1]);
    expect(handleSelect).toHaveBeenCalledWith("București");
  });

  it("shows 'Coming soon' for inactive cities", async () => {
    const user = userEvent.setup();
    renderSelector({ currentCity: "București", onSelect: jest.fn() });
    await user.click(screen.getByLabelText("Alege orașul"));
    const comingSoonTexts = screen.getAllByText("În curând");
    expect(comingSoonTexts.length).toBe(4);
  });
});
