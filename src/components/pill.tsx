interface PillProps {
  label: string;
  active?: boolean;
  icon?: string;
  count?: number;
  dismissible?: boolean;
  hasDropdown?: boolean;
  onToggle?: () => void;
  onDismiss?: () => void;
}

export function Pill({
  label,
  active = false,
  icon,
  count,
  dismissible = false,
  hasDropdown = false,
  onToggle,
  onDismiss,
}: PillProps) {
  const baseClasses = [
    "rounded-pill px-3 py-1.5 text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1",
    active ? "bg-brand-primary text-white" : "bg-surface-bg text-text-secondary",
  ].join(" ");

  // When dismissible AND active, render a container with two separate buttons
  // to avoid nesting interactive elements (invalid HTML).
  if (dismissible && active) {
    return (
      <div className={baseClasses}>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={onToggle ? active : undefined}
          className="inline-flex items-center gap-1 bg-transparent border-none p-0 text-inherit font-inherit text-xs font-semibold cursor-pointer"
        >
          {icon && <span>{icon}</span>}
          <span>{label}</span>
          {count !== undefined && <span>{count}</span>}
          {hasDropdown && <span>▾</span>}
        </button>
        <button
          type="button"
          aria-label={`Remove ${label} filter`}
          onClick={onDismiss}
          className="ml-1 bg-transparent border-none p-0 text-inherit font-inherit cursor-pointer"
        >
          ×
        </button>
      </div>
    );
  }

  // Decorative pills (no toggle handler, not dismissible) shouldn't be focusable
  // buttons — screen readers would announce them as buttons that do nothing.
  if (!onToggle && !dismissible) {
    return (
      <span className={baseClasses}>
        {icon && <span>{icon}</span>}
        <span>{label}</span>
        {count !== undefined && <span>{count}</span>}
        {hasDropdown && <span>▾</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={onToggle ? active : undefined}
      className={baseClasses}
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
      {count !== undefined && <span>{count}</span>}
      {hasDropdown && <span>▾</span>}
    </button>
  );
}
