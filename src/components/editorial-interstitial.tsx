export interface EditorialInterstitialProps {
  eyebrow?: string;
  body: string;
  attribution?: string;
}

export function EditorialInterstitial({
  eyebrow,
  body,
  attribution,
}: EditorialInterstitialProps) {
  return (
    <aside className="py-10 desktop:py-14 max-w-2xl mx-auto text-center">
      {eyebrow && (
        <p className="text-xs tracking-[0.3em] uppercase text-brand-primary font-semibold mb-5">
          {eyebrow}
        </p>
      )}
      <p className="font-display italic text-xl desktop:text-2xl text-text-primary leading-snug">
        {body}
      </p>
      {attribution && (
        <p className="text-sm text-text-muted mt-4">{attribution}</p>
      )}
    </aside>
  );
}
