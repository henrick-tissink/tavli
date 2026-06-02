"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/messages-provider";

interface PillPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  id: string;
  title?: string;
  onClear?: () => void;
  clearLabel?: string;
  width?: number;
  align?: "start" | "end";
}

const VIEWPORT_PADDING = 12;
const DEFAULT_WIDTH = 240;

export function PillPopover({
  open,
  onClose,
  anchorRef,
  children,
  id,
  title,
  onClear,
  clearLabel,
  width = DEFAULT_WIDTH,
  align = "start",
}: PillPopoverProps) {
  const t = useT("ui");
  const resolvedClearLabel = clearLabel ?? t("clear");
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Toggled to true on the frame after mount so the entrance transition fires.
  const [entered, setEntered] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      setEntered(false);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;

    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
      let left = align === "end" ? rect.right - width : rect.left;
      left = Math.max(VIEWPORT_PADDING, Math.min(maxLeft, left));
      setPos({ top: rect.bottom + 6, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef, width, align]);

  // After the first paint with a position, flip `entered` so the opacity/scale
  // transition runs once.
  useEffect(() => {
    if (!open || !pos) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open, pos]);

  // Focus the dialog on open and restore focus to the anchor on close so
  // keyboard users land where they expect.
  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const raf = requestAnimationFrame(() => {
      popoverRef.current?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      anchor?.focus({ preventScroll: true });
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(t) &&
        anchorRef.current && !anchorRef.current.contains(t)
      ) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popoverRef}
      id={id}
      role="dialog"
      aria-labelledby={title ? titleId : undefined}
      tabIndex={-1}
      className={[
        "fixed z-60 bg-surface-white rounded-xl shadow-floating border border-border",
        "max-h-[60vh] flex flex-col",
        "transition duration-150 ease-out origin-top focus:outline-none",
        entered ? "opacity-100 scale-100" : "opacity-0 scale-95",
      ].join(" ")}
      style={{ top: pos.top, left: pos.left, width }}
    >
      {title && (
        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0 border-b border-border/60">
          <h3
            id={titleId}
            className="text-xs font-bold uppercase tracking-wider text-text-muted"
          >
            {title}
          </h3>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-semibold text-brand-primary"
            >
              {resolvedClearLabel}
            </button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>,
    document.body,
  );
}
