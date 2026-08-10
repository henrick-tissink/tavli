import Image from "next/image";

const VARIANTS = {
  horizontal: { src: "/brand/tavli-logo-horizontal.svg", width: 489, height: 160 },
  stacked: { src: "/brand/tavli-logo-stacked.svg", width: 200, height: 236 },
  mark: { src: "/brand/tavli-mark.svg", width: 569, height: 571 },
  wordmark: { src: "/brand/tavli-wordmark.svg", width: 435, height: 100 },
  icon: { src: "/brand/tavli-favicon.svg", width: 32, height: 32 },
} as const;

interface TavliLogoProps {
  variant?: keyof typeof VARIANTS;
  /** Size via Tailwind, e.g. "h-7 w-auto". */
  className?: string;
  /** Pass "" when a parent link already carries the accessible name. */
  alt?: string;
}

export function TavliLogo({
  variant = "horizontal",
  className = "h-7 w-auto",
  alt = "Tavli",
}: TavliLogoProps) {
  const v = VARIANTS[variant];
  return (
    <Image
      src={v.src}
      alt={alt}
      width={v.width}
      height={v.height}
      className={className}
      aria-hidden={alt === "" || undefined}
      unoptimized
    />
  );
}
