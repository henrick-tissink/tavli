interface SentimentBarProps {
  icon: string;
  label: string;
  percent: number;
  mentionCount: number;
}

export function SentimentBar({ icon, label, percent, mentionCount }: SentimentBarProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-lg">{icon}</span>
      <span className="text-sm font-medium text-text-primary w-24">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[#E7E5E4]">
        <div
          data-testid="sentiment-bar-fill"
          className="h-2 rounded-full bg-brand-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-sm font-bold text-text-primary w-10 text-right">{percent}%</span>
    </div>
  );
}
