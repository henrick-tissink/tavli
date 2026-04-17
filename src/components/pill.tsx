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
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        "rounded-pill px-3 py-1.5 text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1",
        active ? "bg-brand-primary text-white" : "bg-surface-bg text-text-secondary",
      ].join(" ")}
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
      {count !== undefined && <span>{count}</span>}
      {hasDropdown && <span>▾</span>}
      {dismissible && active && (
        <span
          role="button"
          aria-label={`Remove ${label} filter`}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss?.();
          }}
          className="ml-1 cursor-pointer"
        >
          ×
        </span>
      )}
    </button>
  );
}
