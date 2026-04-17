"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        data-testid="sheet-backdrop"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet panel - mobile: bottom sheet, desktop: centered modal */}
      <div
        className={[
          "absolute bg-surface-white shadow-modal overflow-y-auto",
          // Mobile: bottom sheet
          "bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl",
          // Desktop: centered modal
          "lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:right-auto lg:w-[520px] lg:rounded-2xl lg:max-h-[80vh]",
        ].join(" ")}
      >
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 lg:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          {title ? (
            <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          ) : (
            <div />
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-surface-bg text-text-secondary"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
