import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  rightSlot?: ReactNode;
}

export function SectionHeader({ title, subtitle, icon, rightSlot }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        <h3 className="font-display text-2xl desktop:text-3xl font-bold text-text-primary leading-tight tracking-tight flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
      </div>
      {rightSlot}
    </div>
  );
}
