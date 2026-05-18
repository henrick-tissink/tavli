export type Occasion =
  | "wedding"
  | "birthday"
  | "corporate_dinner"
  | "product_launch"
  | "other";

export interface PrivateSpaceTile {
  id: string;
  name: string;
  description: string | null;
  capacityMin: number;
  capacityMax: number;
  photoStoragePath: string | null;
}
