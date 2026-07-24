// design-sync bundle entry — ONLY the scoped design-system components plus the
// i18n provider + RO bundle. Narrow on purpose: a full src/ walk drags in
// server-only code (analytics/run-export -> archiver). Passed via cfg.entry.
export { MessagesProvider } from "@/lib/i18n/messages-provider";
import { buildBundle } from "@/lib/i18n/messages";
export const roBundle = buildBundle("ro", ["ui", "common", "discovery", "booking", "restaurant", "profile", "menu"]);

export * from "@/components/button";
export * from "@/components/avatar";
export * from "@/components/rating-chip";
export * from "@/components/section-header";
export * from "@/components/sentiment-bar";
export * from "@/components/toast";
export * from "@/components/editorial-interstitial";
export * from "@/components/map-pin";
export * from "@/components/pill";
export * from "@/components/time-slot-pills";
export * from "@/components/tab-bar";
export * from "@/components/bottom-sheet";
export * from "@/components/status-badge";
export * from "@/components/review-card";
export * from "@/components/dietary-filter-row";
export * from "@/components/city-selector";
export * from "@/components/pill-popover";
export * from "@/components/password-input";
export * from "@/components/restaurant-card";
export * from "@/components/menu-item-card";
export * from "@/components/city-cover-hero";
export * from "@/components/photo-gallery";
