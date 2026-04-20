/**
 * Server-side helpers for reading the current Supabase session and the
 * linked `profiles` row. Use from server components, route handlers, and
 * server actions.
 */

import "server-only";
import { createSupabaseServerClient } from "@/lib/db/server";

export type SessionRole = "admin" | "restaurant_owner" | "consumer";

export interface SessionProfile {
  id: string;
  role: SessionRole;
  fullName: string | null;
  email: string | null;
  locale: string;
}

export interface CurrentSession {
  userId: string;
  userEmail: string | null;
  profile: SessionProfile;
}

/**
 * Returns the current session (user + profile) or null if not signed in.
 * Gracefully returns null when Supabase env vars are missing so consumer
 * routes don't crash during early Phase 2 dev.
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, locale")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    userId: user.id,
    userEmail: user.email ?? null,
    profile: {
      id: profile.id,
      role: profile.role as SessionRole,
      fullName: profile.full_name,
      email: profile.email,
      locale: profile.locale,
    },
  };
}

/**
 * Throws if the user isn't signed in, or their role doesn't match.
 * Admin passes every check.
 */
export async function requireRole(role: SessionRole): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw new NotAuthenticatedError();
  }
  if (session.profile.role !== role && session.profile.role !== "admin") {
    throw new ForbiddenError(`Requires role: ${role}`);
  }
  return session;
}

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "NotAuthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}
