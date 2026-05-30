import Link from "next/link";
import Image from "next/image";

interface EmptyStateAction {
  label: string;
  href: string;
}

interface EmptyStateProps {
  illustration: string;
  title: string;
  body: string;
  action?: EmptyStateAction;
}

export function EmptyState({ illustration, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      <Image
        src={illustration}
        alt={title}
        width={208}
        height={144}
        className="mb-5 h-32 w-auto object-contain opacity-90"
        unoptimized
      />
      <h2 className="font-display text-xl font-bold text-text-primary">{title}</h2>
      <p className="text-sm text-text-secondary mt-2 max-w-sm">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-button bg-brand-primary text-white text-sm font-semibold hover:bg-brand-primary-dark transition-colors"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
