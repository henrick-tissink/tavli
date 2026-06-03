"use client";

import { useT } from "@/lib/i18n/messages-provider";

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
  const t = useT("ui");
  const layout =
    "rounded-pill px-3 py-1.5 text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1";
  // Decorative pills stay flat. Interactive ones (button / dismissible) get a
  // visible boundary against the matching surface-bg backdrop plus hover + cursor
  // affordance, so they read as the controls they are.
  const staticClasses = [
    layout,
    active ? "bg-brand-primary text-white" : "bg-surface-bg text-text-secondary",
  ].join(" ");
  const interactiveClasses = [
    layout,
    "cursor-pointer transition-colors",
    active
      ? "bg-brand-primary text-white hover:bg-brand-primary-dark"
      : "bg-surface-white text-text-secondary border border-border hover:bg-surface-bg hover:text-text-primary",
  ].join(" ");

  // When dismissible AND active, render a container with two separate buttons
  // to avoid nesting interactive elements (invalid HTML).
  if (dismissible && active) {
    return (
      <div className={interactiveClasses}>
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
          aria-label={t("removeFilter", { label })}
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
      <span className={staticClasses}>
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
      className={interactiveClasses}
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
      {count !== undefined && <span>{count}</span>}
      {hasDropdown && <span>▾</span>}
    </button>
  );
}
