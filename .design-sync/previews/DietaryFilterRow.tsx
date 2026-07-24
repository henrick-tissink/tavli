import { DietaryFilterRow } from "tavli";
export const Default = () => (
  <div style={{ padding: 16, maxWidth: 520 }}>
    <DietaryFilterRow activeFilters={new Set()} onToggle={() => {}} onClear={() => {}} />
  </div>
);
