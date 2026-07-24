import { TimeSlotPills } from "tavli";
export const Available = () => (
  <div style={{ padding: 16, maxWidth: 360 }}>
    <TimeSlotPills slots={["18:00", "18:30", "19:00", "19:30", "20:00", "20:30"]} maxVisible={4} filterPast={false} onSelect={() => {}} onMore={() => {}} />
  </div>
);
export const Selected = () => (
  <div style={{ padding: 16, maxWidth: 360 }}>
    <TimeSlotPills slots={["19:00", "19:30", "20:00", "20:30"]} selected="19:30" filterPast={false} onSelect={() => {}} />
  </div>
);
