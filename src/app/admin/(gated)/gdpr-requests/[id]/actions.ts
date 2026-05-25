"use server";

import { revalidatePath } from "next/cache";
import { dsrActions, type RequestKind, type RequestSource } from "@/lib/compliance/dsr-actions";

export async function createDsrAction(formData: FormData) {
  const result = await dsrActions.createDsr({
    identifier_phone: (formData.get("identifier_phone") as string) || undefined,
    identifier_email: (formData.get("identifier_email") as string) || undefined,
    request_kind: formData.get("request_kind") as RequestKind,
    request_source: formData.get("request_source") as RequestSource,
    request_body: (formData.get("request_body") as string) || undefined,
  });
  revalidatePath("/admin/gdpr-requests");
  return result;
}

export async function resolveDinerAction(dsrId: string, dinerIds: string[]) {
  await dsrActions.resolveDinerForDsr({ dsrId, diner_ids: dinerIds });
  revalidatePath(`/admin/gdpr-requests/${dsrId}`);
}

export async function verifyIdentityAction(dsrId: string, reason: string) {
  await dsrActions.verifyDsrIdentity({ dsrId, method: "tavli_admin_manual", reason });
  revalidatePath(`/admin/gdpr-requests/${dsrId}`);
}

export async function approveErasureAction(dsrId: string) {
  await dsrActions.approveDsrErasure({ dsrId });
  revalidatePath(`/admin/gdpr-requests/${dsrId}`);
}

export async function approveRestrictionAction(dsrId: string) {
  await dsrActions.approveDsrRestriction({ dsrId });
  revalidatePath(`/admin/gdpr-requests/${dsrId}`);
}

export async function rejectDsrAction(dsrId: string, reason: string) {
  await dsrActions.rejectDsr({ dsrId, reason });
  revalidatePath(`/admin/gdpr-requests/${dsrId}`);
}

export async function extendDeadlineAction(dsrId: string, days: number, reason: string) {
  await dsrActions.extendDsrDeadline({ dsrId, days, reason });
  revalidatePath(`/admin/gdpr-requests/${dsrId}`);
}

export async function retryErasureCascadeAction(dsrId: string) {
  await dsrActions.retryErasureCascade({ dsrId });
  revalidatePath(`/admin/gdpr-requests/${dsrId}`);
}
