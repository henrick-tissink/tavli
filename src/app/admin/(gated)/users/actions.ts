"use server";

import {
  startImpersonationSession,
  stopImpersonationSession,
} from "@/lib/auth/impersonation-session";

export async function impersonateAction(formData: FormData): Promise<void> {
  const targetUserId = String(formData.get("target_user_id") ?? "");
  const reason = String(formData.get("reason") ?? "") || undefined;
  if (!targetUserId) throw new Error("targetUserId required");
  await startImpersonationSession(targetUserId, reason);
}

export async function stopAction(): Promise<void> {
  await stopImpersonationSession();
}
