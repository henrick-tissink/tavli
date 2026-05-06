interface TimeSlotPillsProps {
  slots: string[];
  selected?: string;
  maxVisible?: number;
  onSelect?: (slot: string) => void;
  onMore?: () => void;
}

export function TimeSlotPills({
  slots,
  selected,
  maxVisible = 4,
  onSelect,
  onMore,
}: TimeSlotPillsProps) {
  if (slots.length === 0) {
    return (
      <div className="text-center py-3">
        <button
          type="button"
          className="text-brand-primary text-sm font-semibold inline-flex items-center gap-1"
          onClick={onMore}
        >
          Rezervă pentru altă zi →
        </button>
      </div>
    );
  }

  const visible = slots.slice(0, maxVisible);
  const hasMore = slots.length > maxVisible;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {visible.map((slot) => (
        <button
          key={slot}
          type="button"
          onClick={() => onSelect?.(slot)}
          className={[
            "rounded-lg px-3 py-1.5 text-xs font-semibold",
            slot === selected
              ? "bg-brand-primary text-white"
              : "bg-brand-primary-soft text-brand-primary-dark",
          ].join(" ")}
        >
          {slot}
        </button>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={onMore}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-primary"
        >
          More →
        </button>
      )}
    </div>
  );
}
