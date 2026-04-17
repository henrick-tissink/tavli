import { render, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../auth-context";

function TestConsumer({ onRender }: { onRender: (ctx: ReturnType<typeof useAuth>) => void }) {
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

beforeEach(() => {
  localStorage.clear();
});

describe("AuthContext", () => {
  it("defaults to unauthenticated", () => {
    const getCtx = renderWithProvider();
    expect(getCtx().auth.isAuthenticated).toBe(false);
    expect(getCtx().auth.user).toBeNull();
  });

  it("login creates a user with the given phone", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().login("712345678"); });
    expect(getCtx().auth.isAuthenticated).toBe(true);
    expect(getCtx().auth.user?.phone).toBe("712345678");
    expect(getCtx().auth.user?.city).toBe("București");
    expect(getCtx().auth.user?.memberSince).toBeDefined();
  });

  it("logout clears the user", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().login("712345678"); });
    act(() => { getCtx().logout(); });
    expect(getCtx().auth.isAuthenticated).toBe(false);
    expect(getCtx().auth.user).toBeNull();
  });

  it("updateUser merges partial updates", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().login("712345678"); });
    act(() => { getCtx().updateUser({ name: "Ana", email: "ana@test.com" }); });
    expect(getCtx().auth.user?.name).toBe("Ana");
    expect(getCtx().auth.user?.email).toBe("ana@test.com");
    expect(getCtx().auth.user?.phone).toBe("712345678");
  });

  it("persists to localStorage", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().login("712345678"); });
    const stored = localStorage.getItem("tavli-auth");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.phone).toBe("712345678");
  });

  it("restores from localStorage", () => {
    localStorage.setItem(
      "tavli-auth",
      JSON.stringify({ phone: "799999999", city: "Cluj", memberSince: "2026-01-01" }),
    );
    const getCtx = renderWithProvider();
    expect(getCtx().auth.isAuthenticated).toBe(true);
    expect(getCtx().auth.user?.phone).toBe("799999999");
  });
});
