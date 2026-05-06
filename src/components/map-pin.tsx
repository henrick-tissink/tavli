interface MapPinProps {
  rating: number;
  selected?: boolean;
  unavailable?: boolean;
  count?: number;
}

const BASE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  cursor: "pointer",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontWeight: 700,
  lineHeight: 1,
  transition: "transform 0.15s ease",
};

export function MapPin({
  rating,
  selected = false,
  unavailable = false,
  count,
}: MapPinProps) {
  const isCluster = count !== undefined;

  if (isCluster) {
    return (
      <div
        style={{
          ...BASE,
          width: 36,
          height: 36,
          backgroundColor: "#F97316",
          color: "#FFFFFF",
          fontSize: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        {count}
      </div>
    );
  }

  if (unavailable) {
    return (
      <div
        style={{
          ...BASE,
          width: 24,
          height: 24,
          backgroundColor: "#D4D4D4",
          color: "#666666",
          fontSize: 10,
          boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
        }}
      >
        {rating.toFixed(1)}
      </div>
    );
  }

  if (selected) {
    return (
      <div
        style={{
          ...BASE,
          width: 36,
          height: 36,
          backgroundColor: "#F97316",
          color: "#FFFFFF",
          fontSize: 12,
          border: "3px solid #FFFFFF",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        {rating.toFixed(1)}
      </div>
    );
  }

  return (
    <div
      style={{
        ...BASE,
        width: 28,
        height: 28,
        backgroundColor: "#F97316",
        color: "#FFFFFF",
        fontSize: 11,
        boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
      }}
    >
      {rating.toFixed(1)}
    </div>
  );
}
