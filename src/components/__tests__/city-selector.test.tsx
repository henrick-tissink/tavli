import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CitySelector } from "../city-selector";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { buildBundle } from "@/lib/i18n/messages";

function renderSelector(props: React.ComponentProps<typeof CitySelector>, locale = "ro") {
  const bundle = buildBundle(locale, ["profile", "common"]);
  return render(
    <MessagesProvider locale={locale as "ro" | "en" | "de"} bundle={bundle}>
      <CitySelector {...props} />
    </MessagesProvider>
  );
}

describe("CitySelector", () => {
  it("renders current city label from common.cities (RO)", () => {
    renderSelector({ currentSlug: "bucuresti", onSelect: jest.fn() });
    expect(screen.getByText("București")).toBeInTheDocument();
  });

  it("renders current city label from common.cities (EN)", () => {
    renderSelector({ currentSlug: "bucuresti", onSelect: jest.fn() }, "en");
    expect(screen.getByText("Bucharest")).toBeInTheDocument();
  });

  it("opens dropdown on click", async () => {
    const user = userEvent.setup();
    renderSelector({ currentSlug: "bucuresti", onSelect: jest.fn() });
    await user.click(screen.getByLabelText("Alege orașul"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("shows all cities in dropdown (RO labels)", async () => {
    const user = userEvent.setup();
    renderSelector({ currentSlug: "bucuresti", onSelect: jest.fn() });
    await user.click(screen.getByLabelText("Alege orașul"));
    expect(screen.getByText("Cluj")).toBeInTheDocument();
    expect(screen.getByText("Brașov")).toBeInTheDocument();
    expect(screen.getByText("Iași")).toBeInTheDocument();
  });

  it("calls onSelect with slug for active city", async () => {
    const user = userEvent.setup();
    const handleSelect = jest.fn();
    renderSelector({ currentSlug: "bucuresti", onSelect: handleSelect });
    await user.click(screen.getByLabelText("Alege orașul"));
    // București is the only active city - click its button inside the dropdown
    const bucurestiButtons = screen.getAllByText("București");
    // The second one is inside the dropdown
    await user.click(bucurestiButtons[1]);
    expect(handleSelect).toHaveBeenCalledWith("bucuresti");
  });

  it("shows 'Coming soon' for inactive cities", async () => {
    const user = userEvent.setup();
    renderSelector({ currentSlug: "bucuresti", onSelect: jest.fn() });
    await user.click(screen.getByLabelText("Alege orașul"));
    const comingSoonTexts = screen.getAllByText("În curând");
    expect(comingSoonTexts.length).toBe(4);
  });
});
