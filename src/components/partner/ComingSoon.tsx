import Link from "next/link";
import { Button } from "@/components/button";

interface Props {
  title: string;
  milestone: string;
  description: string;
}

export function ComingSoon({ title, milestone, description }: Props) {
  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
          {title}
        </h1>
      </header>
      <div className="bg-surface-white rounded-card border border-border p-10 text-center max-w-lg">
        <p className="font-semibold text-text-primary">Disponibil în {milestone}</p>{/* i18n-allow */}
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          {description}
        </p>
        <div className="mt-6">
          <Link href="/partner">
            <Button variant="secondary">Înapoi la prezentare</Button>{/* i18n-allow */}
          </Link>
        </div>
      </div>
    </div>
  );
}
