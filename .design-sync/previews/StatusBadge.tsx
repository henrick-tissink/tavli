import { StatusBadge } from "tavli";
export const States = () => (
  <div style={{ display: "flex", gap: 16, padding: 16, alignItems: "center", flexWrap: "wrap" }}>
    <StatusBadge status="open" closesAt="23:00" />
    <StatusBadge status="closed" opensAt="12:00" />
    <StatusBadge status="open" variant="compact" />
  </div>
);
