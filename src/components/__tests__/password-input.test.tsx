import { render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { PasswordInput } from "../password-input";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roUi from "@/messages/ro/ui.json";

// PasswordInput reads useT("ui") for the show/hide aria-label.
function render(ui: ReactElement) {
  return rtlRender(
    <MessagesProvider locale="ro" bundle={{ ui: roUi }}>
      {ui}
    </MessagesProvider>,
  );
}

describe("PasswordInput", () => {
  it("renders type=password by default", () => {
    render(<PasswordInput name="pw" data-testid="pw" />);
    const input = screen.getByTestId("pw") as HTMLInputElement;
    expect(input.type).toBe("password");
  });

  it("toggle button switches type to text and back", async () => {
    const user = userEvent.setup();
    render(
      <label>
        Password
        <PasswordInput name="pw" />
      </label>,
    );
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");

    const toggle = screen.getByRole("button", { name: /arată parola/i });
    await user.click(toggle);
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: /ascunde parola/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ascunde parola/i }));
    expect(input.type).toBe("password");
  });

  it("toggle button reflects state via aria-pressed", async () => {
    const user = userEvent.setup();
    render(<PasswordInput name="pw" />);
    const toggle = screen.getByRole("button", { name: /arată parola/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("does not lose focus when toggling", async () => {
    const user = userEvent.setup();
    render(
      <label>
        Password
        <PasswordInput name="pw" />
      </label>,
    );
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    input.focus();
    expect(input).toHaveFocus();
    await user.click(screen.getByRole("button", { name: /arată parola/i }));
    expect(input).toHaveFocus();
  });

  it("typed value persists across toggle", async () => {
    const user = userEvent.setup();
    render(
      <label>
        Password
        <PasswordInput name="pw" defaultValue="" />
      </label>,
    );
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    await user.type(input, "secret123");
    expect(input.value).toBe("secret123");
    await user.click(screen.getByRole("button", { name: /arată parola/i }));
    expect(input.value).toBe("secret123");
  });

  it("forwards id, name, autoComplete, required, minLength to underlying input", () => {
    render(
      <PasswordInput
        id="pwfield"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
      />,
    );
    const input = document.getElementById("pwfield") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.name).toBe("password");
    expect(input.autocomplete).toBe("new-password");
    expect(input.required).toBe(true);
    expect(input.minLength).toBe(8);
  });
});
