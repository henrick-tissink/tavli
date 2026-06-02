"use client";

import { useEffect, useRef } from "react";
import QRCodeStyling from "qr-code-styling";

interface MenuQrCardProps {
  restaurantName: string;
  menuUrl: string;
  size?: "single" | "tile";
  /**
   * Localized scan-prompt caption. Rendered in both the consumer menu page and
   * the partner QR generator — each parent passes the string from its own
   * namespace. Defaults to the RO source string for callers that omit it.
   */
  caption?: string;
}

const QR_PIXELS: Record<"single" | "tile", number> = {
  single: 280,
  tile: 140,
};

const STYLE_B_BASE = {
  type: "svg" as const,
  margin: 4,
  qrOptions: { errorCorrectionLevel: "H" as const },
  backgroundOptions: { color: "#FEF0DC" },
  dotsOptions: { type: "dots" as const, color: "#F97316" },
  cornersSquareOptions: {
    type: "extra-rounded" as const,
    color: "#C2410C",
  },
  cornersDotOptions: { type: "dot" as const, color: "#F97316" },
};

export function MenuQrCard({
  restaurantName,
  menuUrl,
  size = "single",
  caption = "Scanează pentru a vedea meniul nostru",
}: MenuQrCardProps) {
  const qrHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!qrHostRef.current) return;
    qrHostRef.current.innerHTML = "";
    const px = QR_PIXELS[size];
    const qr = new QRCodeStyling({
      ...STYLE_B_BASE,
      width: px,
      height: px,
      data: menuUrl,
    });
    qr.append(qrHostRef.current);
  }, [menuUrl, size]);

  const isSingle = size === "single";
  const cardSizing = isSingle
    ? "p-8 gap-3 max-w-[460px] aspect-[1/1.414] mx-auto"
    : "p-3 gap-1.5 aspect-square w-full";
  const nameSizing = isSingle ? "text-2xl" : "text-sm";
  const captionSizing = isSingle ? "text-base" : "text-[10px]";
  const creditSizing = isSingle ? "text-xs" : "text-[8px]";

  return (
    <div
      data-testid="menu-qr-card"
      data-size={size}
      className={`menu-qr-card relative flex flex-col items-center justify-between bg-gradient-to-b from-[#FFF7ED] to-[#FEF0DC] border-[1.5px] border-dashed border-[#FDBA74] rounded-[18px] ${cardSizing}`}
    >
      <span
        aria-hidden
        className={`text-[#C2410C] ${isSingle ? "text-2xl" : "text-base"} leading-none`}
      >
        ✦
      </span>
      <h2
        className={`font-display italic ${nameSizing} text-text-primary text-center leading-tight ${
          isSingle ? "font-bold" : "font-semibold"
        }`}
      >
        {restaurantName}
      </h2>
      <div ref={qrHostRef} data-testid="menu-qr-host" />
      <p
        className={`font-display italic ${captionSizing} text-text-secondary text-center`}
      >
        {caption}
      </p>
      <p className={`text-text-muted ${creditSizing}`}>tavli.ro</p>
    </div>
  );
}
