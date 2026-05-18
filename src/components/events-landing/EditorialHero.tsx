export function EditorialHero({
  city,
  venueCount,
}: {
  city: string;
  venueCount: number;
}) {
  return (
    <header className="relative rounded-card overflow-hidden bg-gradient-to-br from-[color:var(--color-occasion-wedding-soft)] via-surface-white to-[color:var(--color-occasion-corporate-soft)] p-8 desktop:p-12 mb-8">
      <span className="text-xs font-semibold text-[color:var(--color-occasion-corporate)] uppercase tracking-widest">
        Tavli · evenimente private
      </span>
      <h1 className="font-display text-4xl desktop:text-5xl font-bold mt-2 max-w-2xl leading-tight">
        Momente memorabile, găzduite în {city}.
      </h1>
      <p className="text-base text-text-secondary mt-4 max-w-xl">
        Restaurante și locații atent verificate, care primesc cereri pentru
        evenimente private — nunți, aniversări, cine corporate. Cere ofertă în
        60 de secunde.
      </p>
      <p className="text-xs text-text-muted mt-6">
        {venueCount} locații verificate · răspuns garantat în 24h
      </p>
    </header>
  );
}
