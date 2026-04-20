/**
 * Shared role definitions usable from both server and client code (types
 * only — no server-only imports here).
 */

export type SessionRole = "admin" | "restaurant_owner" | "consumer";

export const ROLE_HOME: Record<SessionRole, string> = {
  admin: "/admin",
  restaurant_owner: "/partner",
  consumer: "/",
};
