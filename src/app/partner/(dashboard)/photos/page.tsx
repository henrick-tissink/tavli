import { ComingSoon } from "@/components/partner/ComingSoon";

export const dynamic = "force-dynamic";

export default function PartnerPhotosPage() {
  return (
    <ComingSoon
      title="Photos"
      milestone="M9"
      description="Upload, reorder, delete, and mark hero photos. Drag-and-drop reordering included."
    />
  );
}
