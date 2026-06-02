import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthSheet } from "../auth-sheet";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { buildBundle } from "@/lib/i18n/messages";

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();
const mockUseAuth = jest.fn();

jest.mock("@/lib/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockResolvedValue({});
  mockSignUp.mockResolvedValue({});
  mockUseAuth.mockReturnValue({
    auth: { user: null, isAuthenticated: false, loading: false },
    signIn: mockSignIn,
    signUp: mockSignUp,
    signOut: mockSignOut,
  });
});

function renderSheet(props: Partial<React.ComponentProps<typeof AuthSheet>> = {}) {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    onAuthenticated: jest.fn(),
    ...props,
  };
  const bundle = buildBundle("ro", ["profile"]);
  return {
    ...render(
      <MessagesProvider locale="ro" bundle={bundle}>
        <AuthSheet {...defaultProps} />
      </MessagesProvider>
    ),
    ...defaultProps,
  };
}

describe("AuthSheet", () => {
  it("opens in sign-in mode by default", () => {
    renderSheet();
    expect(screen.getAllByText("Conectează-te")[0]).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Parolă")).toBeInTheDocument();
  });

  it("submit is disabled until email and password are valid", () => {
    renderSheet();
    const button = screen.getByRole("button", { name: "Conectează-te" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ana@test.com" },
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Parolă"), {
      target: { value: "secret123" },
    });
    expect(button).toBeEnabled();
  });

  it("toggles between sign-in and sign-up modes", () => {
    renderSheet();
    fireEvent.click(screen.getByText("Nu ai cont? Creează unul"));
    expect(screen.getAllByText("Creează cont").length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByText("Ai deja cont? Conectează-te"));
    expect(screen.getAllByText("Conectează-te").length).toBeGreaterThanOrEqual(1);
  });

  it("calls signIn with the entered credentials and closes on success", async () => {
    const onClose = jest.fn();
    const onAuthenticated = jest.fn();
    renderSheet({ onClose, onAuthenticated });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ana@test.com" },
    });
    fireEvent.change(screen.getByLabelText("Parolă"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Conectează-te" }));
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("ana@test.com", "secret123");
    });
    expect(onAuthenticated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the error message when sign-in fails", async () => {
    mockSignIn.mockResolvedValueOnce({ error: "Invalid login credentials" });
    renderSheet();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ana@test.com" },
    });
    fireEvent.change(screen.getByLabelText("Parolă"), {
      target: { value: "wrong123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Conectează-te" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid login credentials",
      );
    });
  });

  it("shows the confirmation panel when sign-up requires email confirmation", async () => {
    mockSignUp.mockResolvedValueOnce({ needsConfirmation: true });
    renderSheet();
    fireEvent.click(screen.getByText("Nu ai cont? Creează unul"));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@test.com" },
    });
    fireEvent.change(screen.getByLabelText("Parolă"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Creează cont" }));
    await waitFor(() => {
      expect(screen.getByText(/Ți-am trimis un email/)).toBeInTheDocument();
    });
    expect(screen.getByText(/new@test\.com/)).toBeInTheDocument();
  });

  it("calls signUp directly when in sign-up mode", async () => {
    mockSignUp.mockResolvedValueOnce({});
    const onAuthenticated = jest.fn();
    renderSheet({ onAuthenticated });
    fireEvent.click(screen.getByText("Nu ai cont? Creează unul"));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@test.com" },
    });
    fireEvent.change(screen.getByLabelText("Parolă"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Creează cont" }));
    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith("new@test.com", "secret123");
    });
    expect(onAuthenticated).toHaveBeenCalled();
  });
});
