"use server";

/**
 * §15 §16 — public wait-list join server action. Thin wrapper over the
 * pricing/waitlist lib: resolves the client IP for rate-limiting, then
 * translates the lib's coded WaitlistError into an ActionResult. Never throws
 * across the boundary.
 */
import { headers } from "next/headers";
import {
  joinWaitlist as joinWaitlistLib,
  WaitlistError,
} from "@/lib/pricing/waitlist";
import { ok, fail, type ActionResult } from "@/lib/server-action";
import type { ActionErrorCode } from "@/lib/errors/codes";

export interface JoinWaitlistFormInput {
  email: string;
  organizationNameHint?: string;
  locale: string;
}

export async function joinWaitlist(
  input: JoinWaitlistFormInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const { id } = await joinWaitlistLib({
      email: input.email,
      organizationNameHint: input.organizationNameHint,
      locale: input.locale,
      ip,
    });
    return ok({ id });
  } catch (err) {
    if (err instanceof WaitlistError) {
      return fail(err.message as ActionErrorCode);
    }
    return fail("internal");
  }
}
