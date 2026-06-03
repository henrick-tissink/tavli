"use client";

import { useRef, useState, useCallback } from "react";
import Image from "next/image";
import { ArrowLeft, ChevronLeft, ChevronRight, Heart, Share2, Star } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";

interface PhotoGalleryProps {
  photos: string[];
  restaurantName: string;
  onBack?: () => void;
  onSave?: () => void;
  onShare?: () => void;
  saved?: boolean;
  overlayTitle?: string;
  overlaySubtitle?: string;
  overlayRating?: { value: number; voteCount: number };
}

export function PhotoGallery({
  photos,
  restaurantName,
  onBack,
  onSave,
  onShare,
  saved = false,
  overlayTitle,
  overlaySubtitle,
  overlayRating,
}: PhotoGalleryProps) {
  const t = useT("restaurant");
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const width = el.clientWidth;
    const index = Math.round(scrollLeft / width);
    setCurrentIndex(index);
  }, []);

  const scrollToIndex = useCallback(
    (i: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(i, photos.length - 1));
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    },
    [photos.length],
  );

  if (photos.length === 0) {
    return (
      <div className="relative w-full h-[280px] desktop:h-[400px]">
        <div className="w-full h-full bg-gradient-to-br from-brand-primary to-brand-primary-dark flex items-center justify-center">
          {!overlayTitle && (
            <span className="text-white text-2xl font-bold">{restaurantName}</span>
          )}
        </div>
        {/* Overlay content on fallback */}
        {overlayTitle && (
          <div className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
        )}
        {overlayTitle && (
          <div className="absolute bottom-0 left-0 right-0 p-5 desktop:p-8">
            <h1 className="font-display text-4xl desktop:text-6xl font-bold text-white leading-[0.95] tracking-tight">
              {overlayTitle}
            </h1>
            <div className="flex items-center justify-between mt-2">
              {overlaySubtitle && (
                <p className="text-white/90 text-sm desktop:text-base">{overlaySubtitle}</p>
              )}
              {overlayRating && (
                <div className="flex items-center gap-1 bg-white/15 backdrop-blur-sm border border-white/20 text-white text-sm font-bold px-2.5 py-1 rounded-full ml-3 shrink-0">
                  <Star size={12} className="fill-white" aria-hidden />
                  {overlayRating.value.toFixed(1)}
                  <span className="font-normal opacity-80 text-xs">({overlayRating.voteCount})</span>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Floating nav */}
        <div className="absolute top-4 left-4 right-4 flex justify-between">
          {onBack && (
            <button
              type="button"
              aria-label={t("gallery.backAriaLabel")}
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="flex gap-2">
            {onSave && (
              <button
                type="button"
                aria-label={t("gallery.saveAriaLabel")}
                onClick={onSave}
                className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
              >
                <Heart size={20} fill={saved ? "currentColor" : "none"} />
              </button>
            )}
            {onShare && (
              <button
                type="button"
                aria-label={t("gallery.shareAriaLabel")}
                onClick={onShare}
                className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
              >
                <Share2 size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[280px] desktop:h-[400px]">
      {/* Scrollable photo container — keyboard-navigable carousel */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            scrollToIndex(currentIndex + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            scrollToIndex(currentIndex - 1);
          }
        }}
        tabIndex={photos.length > 1 ? 0 : undefined}
        role="region"
        aria-roledescription="carousel"
        aria-label={restaurantName}
        className="w-full h-full overflow-x-auto snap-x snap-mandatory flex hide-scrollbar focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
      >
        {photos.map((photo, i) => (
          <div key={i} className="snap-start w-full h-full flex-shrink-0 relative">
            <Image
              src={photo}
              alt={`${restaurantName} photo ${i + 1}`}
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {/* Magazine-cover overlay — only on first slide */}
      {overlayTitle && currentIndex === 0 && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 p-5 desktop:p-8">
            <h1 className="font-display text-4xl desktop:text-6xl font-bold text-white leading-[0.95] tracking-tight">
              {overlayTitle}
            </h1>
            <div className="flex items-center mt-2 gap-3">
              {overlaySubtitle && (
                <p className="text-white/90 text-sm desktop:text-base flex-1">{overlaySubtitle}</p>
              )}
              {overlayRating && (
                <div className="flex items-center gap-1 bg-white/15 backdrop-blur-sm border border-white/20 text-white text-sm font-bold px-2.5 py-1 rounded-full shrink-0">
                  <Star size={12} className="fill-white" aria-hidden />
                  {overlayRating.value.toFixed(1)}
                  <span className="font-normal opacity-80 text-xs">({overlayRating.voteCount})</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Desktop prev/next arrows — the discoverable affordance for mouse users
          (touch users swipe; the dots work everywhere). Hidden at the ends. */}
      {photos.length > 1 && (
        <>
          <button
            type="button"
            aria-label={t("gallery.prevAriaLabel")}
            onClick={() => scrollToIndex(currentIndex - 1)}
            className={`hidden desktop:flex absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm items-center justify-center text-white transition-opacity hover:bg-black/50 ${
              currentIndex === 0 ? "opacity-0 pointer-events-none" : ""
            }`}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            aria-label={t("gallery.nextAriaLabel")}
            onClick={() => scrollToIndex(currentIndex + 1)}
            className={`hidden desktop:flex absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm items-center justify-center text-white transition-opacity hover:bg-black/50 ${
              currentIndex === photos.length - 1 ? "opacity-0 pointer-events-none" : ""
            }`}
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Dot indicators — clickable, so they double as navigation everywhere. */}
      <div className={`absolute ${overlayTitle && currentIndex === 0 ? "bottom-[72px] desktop:bottom-[88px]" : "bottom-4"} left-0 right-0 flex justify-center gap-0.5`}>
        {photos.map((_, i) => (
          <button
            key={i}
            type="button"
            data-testid="gallery-dot"
            onClick={() => scrollToIndex(i)}
            aria-label={t("gallery.goToPhotoAriaLabel", { n: i + 1 })}
            aria-current={i === currentIndex ? "true" : undefined}
            className="p-1.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <span
              className={`block h-2 rounded-full transition-all ${
                i === currentIndex ? "w-5 bg-white" : "w-2 bg-white/50"
              }`}
            />
          </button>
        ))}
      </div>

      {/* Floating nav */}
      <div className="absolute top-4 left-4 right-4 flex justify-between">
        {onBack ? (
          <button
            type="button"
            aria-label={t("gallery.backAriaLabel")}
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          {onSave && (
            <button
              type="button"
              aria-label={t("gallery.saveAriaLabel")}
              onClick={onSave}
              className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
            >
              <Heart size={20} fill={saved ? "currentColor" : "none"} />
            </button>
          )}
          {onShare && (
            <button
              type="button"
              aria-label={t("gallery.shareAriaLabel")}
              onClick={onShare}
              className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
            >
              <Share2 size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
