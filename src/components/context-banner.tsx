interface ContextBannerProps {
  greeting: string;
  subtext: string;
}

export function ContextBanner({ greeting, subtext }: ContextBannerProps) {
  return (
    <div>
      <h1 className="text-[28px] desktop:text-[36px] font-extrabold text-text-primary">
        {greeting}
      </h1>
      <p className="text-sm text-text-secondary mt-1">{subtext}</p>
    </div>
  );
}
