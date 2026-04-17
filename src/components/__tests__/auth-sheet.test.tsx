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
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
  });

  it("Continue is disabled with short phone number", () => {
    renderSheet();
    const btn = screen.getByText("Continue").closest("button");
    expect(btn).toBeDisabled();
  });

  it("advances to OTP step after valid phone + Continue", () => {
    renderSheet();
    const input = screen.getByLabelText("Phone number");
    fireEvent.change(input, { target: { value: "712345678" } });
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
    expect(screen.getByText("Verify")).toBeInTheDocument();
  });

  it("calls login and onAuthenticated on verify", () => {
    const { onAuthenticated, onClose } = renderSheet();
    const phoneInput = screen.getByLabelText("Phone number");
    fireEvent.change(phoneInput, { target: { value: "712345678" } });
    fireEvent.click(screen.getByText("Continue"));
    const otpInput = screen.getByLabelText("Verification code");
    fireEvent.change(otpInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByText("Verify"));
    expect(onAuthenticated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
