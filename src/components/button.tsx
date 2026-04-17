import { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-brand-primary text-white hover:bg-brand-primary-dark shadow-card",
  secondary: "bg-brand-primary-soft text-brand-primary-dark hover:bg-orange-100",
  ghost: "bg-transparent text-text-secondary hover:bg-surface-bg border border-border",
};

export function Button({
  variant = "primary",
  fullWidth = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={[
        "rounded-button px-6 py-3 font-bold text-sm transition-all",
        !disabled && "active:scale-[0.98]",
        variantClasses[variant],
        fullWidth && "w-full",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
