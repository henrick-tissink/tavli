const COLORS = [
  "#F97316", "#8B5CF6", "#0EA5E9", "#10B981", "#E11D48",
  "#D97706", "#6366F1", "#14B8A6", "#EC4899", "#7C3AED",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

type AvatarSize = "sm" | "md" | "lg";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "w-7 h-7 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-lg",
};

interface AvatarProps {
  name: string;
  size?: AvatarSize;
}

export function Avatar({ name, size = "md" }: AvatarProps) {
  const color = COLORS[hashName(name) % COLORS.length];
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold text-white`}
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  );
}
