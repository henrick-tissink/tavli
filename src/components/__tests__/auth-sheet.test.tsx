import { render, screen, fireEvent } from "@testing-library/react";
import { AuthSheet } from "../auth-sheet";
import { AuthProvider } from "@/lib/auth-context";

function renderSheet(props: Partial<React.ComponentProps<typeof AuthSheet>> = {}) {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    onAuthenticated: jest.fn(),
    ...props,
  };
  return {
    ...render(
      <AuthProvider>
        <AuthSheet {...defaultProps} />
      </AuthProvider>,
    ),
    ...defaultProps,
  };
}

describe("AuthSheet", () => {
  it("renders phone input initially", () => {
    renderSheet();
    expect(screen.getByLabelText("Număr de telefon")).toBeInTheDocument();
    expect(screen.getByText("Continuă")).toBeInTheDocument();
  });

  it("Continue is disabled with short phone number", () => {
    renderSheet();
    const btn = screen.getByText("Continuă").closest("button");
    expect(btn).toBeDisabled();
  });

  it("advances to OTP step after valid phone + Continue", () => {
    renderSheet();
    const input = screen.getByLabelText("Număr de telefon");
    fireEvent.change(input, { target: { value: "712345678" } });
    fireEvent.click(screen.getByText("Continuă"));
    expect(screen.getByLabelText("Cod de verificare")).toBeInTheDocument();
    expect(screen.getByText("Verifică")).toBeInTheDocument();
  });

  it("calls login and onAuthenticated on verify", () => {
    const { onAuthenticated, onClose } = renderSheet();
    const phoneInput = screen.getByLabelText("Număr de telefon");
    fireEvent.change(phoneInput, { target: { value: "712345678" } });
    fireEvent.click(screen.getByText("Continuă"));
    const otpInput = screen.getByLabelText("Cod de verificare");
    fireEvent.change(otpInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByText("Verifică"));
    expect(onAuthenticated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
