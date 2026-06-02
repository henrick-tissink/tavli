interface Props {
  city: string;
  venueCount: number;
  eyebrow: string;
  heading: string;
  body: string;
  venueCountText: string;
}

export function EditorialHero({
  city,
  venueCount,
  eyebrow,
  heading,
  body,
  venueCountText,
}: Props) {
  return (
    <header className="relative rounded-card overflow-hidden bg-gradient-to-br from-[color:var(--color-occasion-wedding-soft)] via-surface-white to-[color:var(--color-occasion-corporate-soft)] p-8 desktop:p-12 mb-8">
      <span className="text-xs font-semibold text-[color:var(--color-occasion-corporate)] uppercase tracking-widest">
        {eyebrow}
      </span>
      <h1 className="font-display text-4xl desktop:text-5xl font-bold mt-2 max-w-2xl leading-tight">
        {heading.replace("{city}", city)}
      </h1>
      <p className="text-base text-text-secondary mt-4 max-w-xl">
        {body}
      </p>
      <p className="text-xs text-text-muted mt-6">
        {venueCountText}
      </p>
    </header>
  );
}
