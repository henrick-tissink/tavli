"use client";

import { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Store the previously focused element to restore on close
    previousFocusRef.current = document.activeElement as HTMLElement;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the panel on open
    requestAnimationFrame(() => {
      panelRef.current?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Focus trap: cycle Tab within the sheet
      if (e.key === "Tab" && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === panelRef.current) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to previously focused element
      previousFocusRef.current?.focus();
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={[
          "absolute bg-surface-white shadow-modal overflow-y-auto",
          // Mobile: bottom sheet
          "bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl",
          // Desktop: centered modal
          "desktop:bottom-auto desktop:left-1/2 desktop:top-1/2 desktop:-translate-x-1/2 desktop:-translate-y-1/2 desktop:right-auto desktop:w-[520px] desktop:rounded-2xl desktop:max-h-[80vh]",
        ].join(" ")}
      >
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 desktop:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          {title ? (
            <h2 id={titleId} className="text-lg font-bold text-text-primary">{title}</h2>
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
