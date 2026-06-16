import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CuiLookupField } from "@/components/corporate/CuiLookupField";

const defaultLabels = {
  fieldLabel: "CUI",
  placeholder: "RO12345678",
  searchingAriaLabel: "Se caută...",
  foundAriaLabel: "Companie găsită",
  resolvedPrefix: "Companie: ",
};

function renderField(props: Partial<React.ComponentProps<typeof CuiLookupField>>) {
  return render(
    <CuiLookupField
      cui=""
      name=""
      onChange={() => {}}
      labels={defaultLabels}
      {...props}
    />,
  );
}

describe("CuiLookupField", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock | undefined) = jest.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ ok: true, denumire: "Acme S.R.L." }),
        }) as unknown as Response,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("calls the onChange handler when the user types", async () => {
    const onChange = jest.fn();
    renderField({ cui: "", name: "", onChange });
    const input = screen.getByLabelText(/cui/i);
    await userEvent.type(input, "R");
    // Controlled component — every keystroke forwards via onChange.
    expect(onChange).toHaveBeenCalled();
  });

  it("renders the fallback name when no fresh lookup result exists", () => {
    renderField({ cui: "", name: "Existing S.R.L.", onChange: () => {} });
    expect(screen.getByText(/existing s\.r\.l\./i)).toBeInTheDocument();
  });
});
