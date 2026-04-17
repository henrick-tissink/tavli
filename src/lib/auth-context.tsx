"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";

export interface User {
  phone: string;
  name?: string;
  email?: string;
  city: string;
  memberSince: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

interface AuthContextValue {
  auth: AuthState;
  login: (phone: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

const STORAGE_KEY = "tavli-auth";

function loadAuth(): AuthState {
  if (typeof window === "undefined") return { user: null, isAuthenticated: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const user = JSON.parse(raw) as User;
      return { user, isAuthenticated: true };
    }
  } catch {
    // ignore
  }
  return { user: null, isAuthenticated: false };
}

function persistAuth(user: User | null) {
  if (typeof window === "undefined") return;
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => loadAuth());

  // Sync to localStorage on change
  useEffect(() => {
    persistAuth(auth.user);
  }, [auth.user]);

  const login = useCallback((phone: string) => {
    const user: User = {
      phone,
      city: "București",
      memberSince: new Date().toISOString().slice(0, 10),
    };
    setAuth({ user, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    setAuth({ user: null, isAuthenticated: false });
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setAuth((prev) => {
      if (!prev.user) return prev;
      const updated = { ...prev.user, ...updates };
      return { user: updated, isAuthenticated: true };
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ auth, login, logout, updateUser }),
    [auth, login, logout, updateUser],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
