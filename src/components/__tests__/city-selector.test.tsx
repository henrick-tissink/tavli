import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CitySelector } from "../city-selector";

describe("CitySelector", () => {
  it("renders current city", () => {
    render(<CitySelector currentCity="București" onSelect={jest.fn()} />);
    expect(screen.getByText("București")).toBeInTheDocument();
  });

  it("opens dropdown on click", async () => {
    const user = userEvent.setup();
    render(<CitySelector currentCity="București" onSelect={jest.fn()} />);
    await user.click(screen.getByLabelText("Alege orașul"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("shows all cities", async () => {
    const user = userEvent.setup();
    render(<CitySelector currentCity="București" onSelect={jest.fn()} />);
    await user.click(screen.getByLabelText("Alege orașul"));
    expect(screen.getByText("Cluj")).toBeInTheDocument();
    expect(screen.getByText("Timișoara")).toBeInTheDocument();
    expect(screen.getByText("Brașov")).toBeInTheDocument();
    expect(screen.getByText("Iași")).toBeInTheDocument();
  });

  it("calls onSelect for active city", async () => {
    const user = userEvent.setup();
    const handleSelect = jest.fn();
    render(<CitySelector currentCity="București" onSelect={handleSelect} />);
    await user.click(screen.getByLabelText("Alege orașul"));
    // București is the only active city - click its button
    const bucurestiButtons = screen.getAllByText("București");
    // The second one is inside the dropdown
    await user.click(bucurestiButtons[1]);
    expect(handleSelect).toHaveBeenCalledWith("București");
  });

  it("shows 'Coming soon' for inactive cities", async () => {
    const user = userEvent.setup();
    render(<CitySelector currentCity="București" onSelect={jest.fn()} />);
    await user.click(screen.getByLabelText("Alege orașul"));
    const comingSoonTexts = screen.getAllByText("În curând");
    expect(comingSoonTexts.length).toBe(4);
  });
});
