// Merged into window.Tavli via cfg.extraEntries so design-sync previews can
// wrap every component in the i18n MessagesProvider (cfg.provider), which almost
// all Tavli components read via useT()/useLocale(). `roBundle` is the pre-built
// Romanian message bundle the provider needs; referenced from config as
// { "$ref": "roBundle" }.
export { MessagesProvider } from "@/lib/i18n/messages-provider";
import { buildBundle } from "@/lib/i18n/messages";

export const roBundle = buildBundle("ro", [
  "ui",
  "common",
  "discovery",
  "booking",
  "restaurant",
  "profile",
  "menu",
]);
