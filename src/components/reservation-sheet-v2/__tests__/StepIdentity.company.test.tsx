import { render, screen } from "@testing-library/react";
import { StepIdentity } from "../StepIdentity";

jest.mock("@/lib/i18n/messages-provider", () => ({
  useT: () => (key: string) => key,
}));

const base = {
  date: "2026-08-01", slot: "19:00", guests: 2, zone: null,
  name: "A", phone: "+40712345678", email: "", notes: "",
  occasion: "" as const, occasionDate: "",
  onChange: jest.fn(), errors: {},
  bookingForCompany: false, companyCui: "", companyName: "", onPatch: jest.fn(),
};

it("renders the company toggle only when acceptsCorporateMeals is true", () => {
  const { rerender } = render(<StepIdentity {...base} acceptsCorporateMeals={false} />);
  expect(screen.queryByText("sheet.stepIdentity.companyToggleLabel")).toBeNull();

  rerender(<StepIdentity {...base} acceptsCorporateMeals={true} />);
  expect(screen.getByText("sheet.stepIdentity.companyToggleLabel")).toBeInTheDocument();
});
