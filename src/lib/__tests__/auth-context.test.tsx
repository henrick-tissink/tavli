import { render, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../auth-context";

// Stub the browser Supabase client. Each test gets a fresh, controllable
// instance; the AuthProvider memoizes its client per render, so the mock
// must be set up before render is called.
const mockSubscriptionUnsubscribe = jest.fn();
let authStateCallback: ((event: string, session: unknown) => void) | null = null;
const mockGetSession = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();

jest.mock("@/lib/db/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authStateCallback = cb;
        return {
          data: {
            subscription: { unsubscribe: mockSubscriptionUnsubscribe },
          },
        };
      },
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signOut: mockSignOut,
    },
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  authStateCallback = null;
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockSignInWithPassword.mockResolvedValue({ data: { session: null }, error: null });
  mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
  mockSignOut.mockResolvedValue({ error: null });
});

function TestConsumer({
  onRender,
}: {
  onRender: (ctx: ReturnType<typeof useAuth>) => void;
}) {
  const ctx = useAuth();
  onRender(ctx);
  return null;
}

function renderWithProvider() {
  let ctx!: ReturnType<typeof useAuth>;
  render(
    <AuthProvider>
      <TestConsumer onRender={(c) => { ctx = c; }} />
    </AuthProvider>,
  );
  return () => ctx;
}

describe("AuthContext", () => {
  it("starts loading then resolves to unauthenticated when no session", async () => {
    const getCtx = renderWithProvider();
    expect(getCtx().auth.loading).toBe(true);
    await waitFor(() => expect(getCtx().auth.loading).toBe(false));
    expect(getCtx().auth.isAuthenticated).toBe(false);
    expect(getCtx().auth.user).toBeNull();
  });

  it("hydrates with the existing session if one is present", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: { user: { id: "u1", email: "ana@test.com" } },
      },
    });
    const getCtx = renderWithProvider();
    await waitFor(() => expect(getCtx().auth.loading).toBe(false));
    expect(getCtx().auth.isAuthenticated).toBe(true);
    expect(getCtx().auth.user?.email).toBe("ana@test.com");
  });

  it("signIn returns no error on success", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { user: { id: "u1", email: "ana@test.com" } } },
      error: null,
    });
    const getCtx = renderWithProvider();
    await waitFor(() => expect(getCtx().auth.loading).toBe(false));

    const result = await getCtx().signIn("ana@test.com", "secret123");
    expect(result.error).toBeUndefined();
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "ana@test.com",
      password: "secret123",
    });
  });

  it("signIn returns the error message on failure", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });
    const getCtx = renderWithProvider();
    await waitFor(() => expect(getCtx().auth.loading).toBe(false));

    const result = await getCtx().signIn("bad@test.com", "wrong");
    expect(result.error).toBe("Invalid login credentials");
  });

  it("signUp returns needsConfirmation=true when no session is returned", async () => {
    mockSignUp.mockResolvedValueOnce({
      data: { session: null, user: { id: "u1", email: "new@test.com" } },
      error: null,
    });
    const getCtx = renderWithProvider();
    await waitFor(() => expect(getCtx().auth.loading).toBe(false));

    const result = await getCtx().signUp("new@test.com", "secret123");
    expect(result.error).toBeUndefined();
    expect(result.needsConfirmation).toBe(true);
  });

  it("signUp returns needsConfirmation=false when a session is returned", async () => {
    mockSignUp.mockResolvedValueOnce({
      data: { session: { user: { id: "u1", email: "new@test.com" } } },
      error: null,
    });
    const getCtx = renderWithProvider();
    await waitFor(() => expect(getCtx().auth.loading).toBe(false));

    const result = await getCtx().signUp("new@test.com", "secret123");
    expect(result.needsConfirmation).toBe(false);
  });

  it("onAuthStateChange listener updates the context", async () => {
    const getCtx = renderWithProvider();
    await waitFor(() => expect(getCtx().auth.loading).toBe(false));
    expect(getCtx().auth.isAuthenticated).toBe(false);

    act(() => {
      authStateCallback?.("SIGNED_IN", {
        user: { id: "u1", email: "ana@test.com" },
      });
    });

    expect(getCtx().auth.isAuthenticated).toBe(true);
    expect(getCtx().auth.user?.email).toBe("ana@test.com");
  });

  it("signOut calls the underlying client", async () => {
    const getCtx = renderWithProvider();
    await waitFor(() => expect(getCtx().auth.loading).toBe(false));

    await getCtx().signOut();
    expect(mockSignOut).toHaveBeenCalled();
  });
});
