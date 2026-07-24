import { Button } from "tavli";
export const Variants = () => (
  <div style={{ display: "flex", gap: 12, padding: 16, alignItems: "center" }}>
    <Button>Rezervă o masă</Button>
    <Button variant="secondary">Vezi meniul</Button>
    <Button variant="ghost">Anulează</Button>
  </div>
);
export const FullWidth = () => (
  <div style={{ padding: 16, maxWidth: 320 }}>
    <Button fullWidth>Trimite rezervarea</Button>
  </div>
);
