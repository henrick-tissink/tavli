import { ENTITY, type EntityKey } from "@/content/legal/entity";

interface PlaceholderProps {
  name: EntityKey;
}

export function Placeholder({ name }: PlaceholderProps) {
  const value = ENTITY[name];

  if (process.env.NODE_ENV === "production") {
    return <span>{value}</span>;
  }

  return (
    <span
      className="border-dashed border-2 border-brand-primary rounded-[4px] px-1.5 py-0.5 bg-brand-primary-soft text-text-primary font-mono text-[0.95em] inline-flex items-center gap-1 align-baseline"
      title="Replace ENTITY value in src/content/legal/entity.ts"
    >
      <span className="text-[0.7em] uppercase tracking-wider text-brand-primary-dark font-bold">
        PLACEHOLDER
      </span>
      <span>{value}</span>
    </span>
  );
}
