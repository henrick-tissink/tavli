"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

interface SubmitButtonProps {
  children: ReactNode;
  /** Shown while the form is in flight. Falls back to `children`. */
  pendingLabel?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  fullWidth?: boolean;
  className?: string;
}

/**
 * Submit button that reads its own pending state from the enclosing form.
 *
 * Exists for server components rendering `<form action={serverAction}>`, which
 * have no client boundary to hold an `isPending` flag — so those buttons could
 * not show progress at all, and stayed clickable through the round-trip. Being
 * a client component inside the server-rendered form gives `useFormStatus`
 * something to read without making the whole page client-side.
 */
export function SubmitButton({ children, pendingLabel, ...rest }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...rest}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
