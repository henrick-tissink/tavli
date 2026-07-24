import { Avatar } from "tavli";
export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, padding: 16, alignItems: "center" }}>
    <Avatar name="Ana Popescu" size="sm" />
    <Avatar name="Bogdan Ionescu" size="md" />
    <Avatar name="Carmen Dobre" size="lg" />
  </div>
);
