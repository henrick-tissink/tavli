type Status = "open" | "closed";
type StatusVariant = "full" | "compact";

interface StatusBadgeProps {
  status: Status;
  closesAt?: string;
  opensAt?: string;
  variant?: StatusVariant;
}

export function StatusBadge({
  status,
  closesAt,
  opensAt,
  variant = "full",
}: StatusBadgeProps) {
  const isOpen = status === "open";
  const dot = <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: isOpen ? "var(--color-success)" : "var(--color-error)" }} />;

  if (variant === "compact") {
    return (
      <span
        className={[
          "inline-flex items-center gap-1.5 text-xs font-semibold rounded-pill px-2 py-0.5",
          isOpen ? "bg-green-50 text-success" : "bg-red-50 text-error",
        ].join(" ")}
      >
        {dot}
        {isOpen ? "Deschis acum" : "Închis"}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm font-semibold ${isOpen ? "text-success" : "text-error"}`}
    >
      {dot}
      <span>{isOpen ? "Deschis acum" : "Închis"}</span>
      {isOpen && closesAt && <span>· Se închide la {closesAt}</span>}
      {!isOpen && opensAt && <span>· Se deschide la {opensAt}</span>}
    </span>
  );
}
