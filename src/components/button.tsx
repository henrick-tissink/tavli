import { ButtonHTMLAttributes } from "react";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  /**
   * In-flight state. Renders a spinner before the label, sets `aria-busy`, and
   * disables the button so the action cannot be fired twice.
   *
   * Keep the label swap callers already do — `{pending ? t("…Pending") :
   * t("…")}` — because the reduced-motion guard in globals.css freezes the
   * spinner, leaving the text as the only cue for those users.
   */
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-brand-primary text-white hover:bg-brand-primary-dark shadow-card",
  secondary: "bg-brand-primary-soft text-brand-primary-dark hover:bg-orange-100",
  ghost: "bg-transparent text-text-secondary hover:bg-surface-bg border border-border",
  // Destructive actions — suspend, uphold-and-hide, revoke. Without this,
  // call sites had to fight the component with `!` overrides, because equal
  // specificity utilities are resolved by Tailwind's own source order, not by
  // the order of classes in the attribute: a passed `bg-red-600` loses to the
  // variant's own background. White on #DC2626 is 4.83:1, clearing AA.
  danger: "bg-error text-white hover:bg-red-700 shadow-card",
};

export function Button({
  variant = "primary",
  fullWidth = false,
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "rounded-button px-6 py-3 font-bold text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
        !isDisabled && "active:scale-[0.98]",
        variantClasses[variant],
        fullWidth && "w-full",
        isDisabled && "opacity-50 cursor-not-allowed pointer-events-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {loading ? (
        // Children stay mounted so the button keeps its width and the label
        // remains readable while the action runs.
        <span className="inline-flex items-center justify-center gap-2">
          <Spinner />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
