import { Pill } from "tavli";
export const Filters = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 16 }}>
    <Pill label="Terasă" />
    <Pill label="Vegetarian" active />
    <Pill label="Sub 100 lei" count={12} />
    <Pill label="Bucătărie" hasDropdown />
    <Pill label="Rezervabil" dismissible onDismiss={() => {}} />
  </div>
);
