"use client";

import { createContext, useContext, useMemo } from "react";
import { type Locale } from "./locale";
import { translate, type MessageValue, type Vars } from "./t";

type Bundle = Record<string, Record<string, unknown>>;

const MessagesContext = createContext<{ locale: Locale; bundle: Bundle } | null>(null);

export function MessagesProvider({
  locale,
  bundle,
  children,
}: {
  locale: Locale;
  bundle: Bundle;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, bundle }), [locale, bundle]);
  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function useT(ns: string): (key: string, vars?: Vars) => string {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error("useT must be used within a MessagesProvider");
  const messages = (ctx.bundle[ns] ?? {}) as Record<string, unknown>;
  return (key: string, vars?: Vars) => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
        messages,
      );
    if (value === undefined) return key;
    if (
      typeof value !== "string" &&
      !(typeof value === "object" && value !== null && !Array.isArray(value))
    ) {
      return key;
    }
    return translate(ctx.locale, value as MessageValue, vars);
  };
}
