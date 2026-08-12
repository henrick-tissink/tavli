import { Loader2 } from "lucide-react";

interface SpinnerProps {
  /** Pixel size. 16 sits correctly on the Button's 14px text. */
  size?: number;
  className?: string;
  /**
   * Announce the busy state. Omit when adjacent visible text already says what
   * is happening ("Saving…"), which is the common case — otherwise screen
   * readers hear the label twice.
   */
  label?: string;
}

/**
 * The house spinner. Wraps lucide's Loader2, already the de-facto choice in
 * ExportModal and CuiLookupField, so there is one implementation instead of
 * three hand-rolled ones.
 *
 * Inherits `currentColor`, so it reads white inside a primary Button and muted
 * as an input adornment without per-use colour classes.
 *
 * Note: globals.css neutralises every animation under
 * `prefers-reduced-motion: reduce`, so this renders as a static icon for those
 * users rather than disappearing. Always pair it with a text label or a
 * disabled control — never let the spin itself be the only signal.
 */
export function Spinner({ size = 16, className = "", label }: SpinnerProps) {
  return (
    <Loader2
      size={size}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`animate-spin ${className}`.trim()}
    />
  );
}
