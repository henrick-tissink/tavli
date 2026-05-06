"use client";

import { useRef, useState, useCallback } from "react";
import Image from "next/image";
import { ArrowLeft, Heart, Share2 } from "lucide-react";

interface PhotoGalleryProps {
  photos: string[];
  restaurantName: string;
  onBack?: () => void;
  onSave?: () => void;
  onShare?: () => void;
  saved?: boolean;
}

export function PhotoGallery({
  photos,
  restaurantName,
  onBack,
  onSave,
  onShare,
  saved = false,
}: PhotoGalleryProps) {
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

  if (photos.length === 0) {
    return (
      <div className="relative w-full h-[280px] desktop:h-[400px]">
        <div className="w-full h-full bg-gradient-to-br from-brand-primary to-brand-primary-dark flex items-center justify-center">
          <span className="text-white text-2xl font-bold">{restaurantName}</span>
        </div>
        {/* Floating nav */}
        <div className="absolute top-4 left-4 right-4 flex justify-between">
          {onBack && (
            <button
              type="button"
              aria-label="Înapoi"
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
                aria-label="Salvează"
                onClick={onSave}
                className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
              >
                <Heart size={20} fill={saved ? "currentColor" : "none"} />
              </button>
            )}
            {onShare && (
              <button
                type="button"
                aria-label="Share"
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
      {/* Scrollable photo container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="w-full h-full overflow-x-auto snap-x snap-mandatory flex hide-scrollbar"
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

      {/* Dot indicators */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
        {photos.map((_, i) => (
          <div
            key={i}
            data-testid="gallery-dot"
            className={`w-2 h-2 rounded-full ${
              i === currentIndex ? "bg-brand-primary" : "bg-gray-400"
            }`}
          />
        ))}
      </div>

      {/* Floating nav */}
      <div className="absolute top-4 left-4 right-4 flex justify-between">
        {onBack ? (
          <button
            type="button"
            aria-label="Go back"
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
              aria-label="Save"
              onClick={onSave}
              className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
            >
              <Heart size={20} fill={saved ? "currentColor" : "none"} />
            </button>
          )}
          {onShare && (
            <button
              type="button"
              aria-label="Share"
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
