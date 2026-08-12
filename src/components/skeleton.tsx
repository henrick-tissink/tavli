/**
 * The house skeleton block, generalised from the only precedent in the
 * codebase — the reservation sheet's slot grid, which renders
 * `h-11 rounded-button bg-surface-bg animate-pulse`.
 *
 * Height and width stay caller-supplied via `className`, matching that usage.
 *
 * Accessibility: individual blocks are `aria-hidden`. Put `aria-busy="true"`
 * and a label on the *container* instead, so a grid of twelve announces once
 * rather than twelve times.
 */

const ROUNDED = {
  button: "rounded-button",
  card: "rounded-card",
  pill: "rounded-pill",
  full: "rounded-full",
} as const;

const TONE = {
  /** For skeletons on a white surface (cards, sheets). */
  surface: "bg-surface-bg",
  /** For skeletons on `surface-bg` pages, where `surface-bg` is invisible. */
  border: "bg-border",
} as const;

interface SkeletonProps {
  className?: string;
  rounded?: keyof typeof ROUNDED;
  tone?: keyof typeof TONE;
}

export function Skeleton({
  className = "",
  rounded = "button",
  tone = "surface",
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`${TONE[tone]} ${ROUNDED[rounded]} animate-pulse ${className}`.trim()}
    />
  );
}
