import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CuiLookupField } from "../CuiLookupField";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roEvents from "@/messages/ro/events.json";

function renderField(props: React.ComponentProps<typeof CuiLookupField>) {
  return render(
    <MessagesProvider locale="ro" bundle={{ events: roEvents }}>
      <CuiLookupField {...props} />
    </MessagesProvider>,
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
    renderField({ cui: "", denumire: "", onChange });
    const input = screen.getByLabelText(/cui/i);
    await userEvent.type(input, "R");
    // Controlled component — every keystroke forwards via onChange.
    expect(onChange).toHaveBeenCalled();
  });

  it("renders the fallback denumire when no fresh lookup result exists", () => {
    renderField({ cui: "", denumire: "Existing S.R.L.", onChange: () => {} });
    expect(screen.getByText(/existing s\.r\.l\./i)).toBeInTheDocument();
  });
});
