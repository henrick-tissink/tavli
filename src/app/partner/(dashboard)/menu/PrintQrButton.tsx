import Link from "next/link";

interface Props {
  menuItemCount: number;
}

export function PrintQrButton({ menuItemCount }: Props) {
  const enabled = menuItemCount >= 1;
  const baseClasses =
    "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors";

  if (!enabled) {
    return (
      <span
        data-testid="print-qr-button"
        data-disabled="true"
        title="Add at least one menu item before printing"
        aria-disabled="true"
        className={`${baseClasses} border-border text-text-muted bg-surface-bg cursor-not-allowed`}
      >
        Print QR
      </span>
    );
  }

  return (
    <Link
      href="/partner/menu/qr"
      data-testid="print-qr-button"
      data-disabled="false"
      className={`${baseClasses} border-brand-primary text-brand-primary bg-surface-white hover:bg-brand-primary-soft`}
    >
      Print QR
    </Link>
  );
}
