/**
 * Canonical reference for programmatic token access.
 * Components that need token values in JS (not just CSS classes) should import from here.
 * Used by the time-aware system and map theming which need to reference colors programmatically.
 * The CSS custom properties in globals.css are the source of truth for Tailwind classes;
 * these values must be kept in sync.
 */
export const colors = {
  brandPrimary: "#F97316",
  brandPrimarySoft: "#FFF7ED",
  brandPrimaryDark: "#EA580C",
  surfaceWhite: "#FFFFFF",
  surfaceBg: "#FAFAF9",
  surfaceWarm: "#FEF3C7",
  textPrimary: "#1C1917",
  textSecondary: "#78716C",
  textMuted: "#A8A29E",
  border: "#E7E5E4",
  success: "#16A34A",
  error: "#DC2626",
  info: "#0EA5E9",
} as const;

export const spacing = {
  base: 4,
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
} as const;

export const radii = {
  card: "16px",
  button: "10px",
  avatar: "50%",
  pill: "20px",
} as const;

export const shadows = {
  card: "0 2px 8px rgba(0,0,0,0.06)",
  cardHover: "0 4px 16px rgba(0,0,0,0.1)",
  modal: "0 -4px 24px rgba(0,0,0,0.12)",
  floating: "0 4px 20px rgba(0,0,0,0.15)",
} as const;

export const breakpoints = {
  tablet: 768,
  desktop: 1024,
} as const;

export const typography = {
  pageTitle: { weight: 800, sizeMobile: "28px", sizeDesktop: "36px" },
  sectionHeading: { weight: 700, sizeMobile: "20px", sizeDesktop: "24px" },
  cardTitle: { weight: 700, sizeMobile: "17px", sizeDesktop: "18px" },
  body: { weight: 400, sizeMobile: "14px", sizeDesktop: "15px" },
  small: { weight: 500, sizeMobile: "12px", sizeDesktop: "13px" },
  pill: { weight: 600, sizeMobile: "12px", sizeDesktop: "13px" },
  button: { weight: 700, sizeMobile: "14px", sizeDesktop: "15px" },
} as const;
