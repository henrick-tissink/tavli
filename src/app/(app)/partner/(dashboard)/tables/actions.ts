"use server";

import { revalidatePath } from "next/cache";
import { tableActions } from "@/lib/tables/actions";
import type { CreateTableInput } from "@/lib/tables/actions";
import { isOrgBillingLocked } from "@/lib/billing/require-billing-access";

const LOCKED = { ok: false as const, error: "billing_locked" };

function toResult(fn: () => Promise<void>): Promise<{ ok: true } | { ok: false; error: string }>;
function toResult<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }>;
async function toResult<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    if (data === undefined) return { ok: true };
    return { ok: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function createTableAction(
  input: CreateTableInput,
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  if (await isOrgBillingLocked(input.organizationId)) return LOCKED;
  const result = await toResult(() => tableActions.createTable(input));
  if (result.ok) revalidatePath("/partner/tables");
  return result as { ok: true; data: { id: string } } | { ok: false; error: string };
}

export async function updateTableAction(input: {
  id: string;
  restaurantId: string;
  organizationId: string;
  changes: Partial<Omit<CreateTableInput, "restaurantId" | "organizationId">>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isOrgBillingLocked(input.organizationId)) return LOCKED;
  const result = await toResult(() => tableActions.updateTable(input));
  if (result.ok) revalidatePath("/partner/tables");
  return result as { ok: true } | { ok: false; error: string };
}

export async function archiveTableAction(input: {
  id: string;
  restaurantId: string;
  organizationId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isOrgBillingLocked(input.organizationId)) return LOCKED;
  const result = await toResult(() => tableActions.archiveTable(input));
  if (result.ok) revalidatePath("/partner/tables");
  return result as { ok: true } | { ok: false; error: string };
}

export async function createSectionAction(input: {
  restaurantId: string;
  organizationId: string;
  name: string;
  color?: string;
  sortOrder?: number;
}): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  if (await isOrgBillingLocked(input.organizationId)) return LOCKED;
  const result = await toResult(() => tableActions.createSection(input));
  if (result.ok) revalidatePath("/partner/tables");
  return result as { ok: true; data: { id: string } } | { ok: false; error: string };
}

export async function updateSectionAction(input: {
  id: string;
  restaurantId: string;
  organizationId: string;
  changes: { name?: string; color?: string; sortOrder?: number };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isOrgBillingLocked(input.organizationId)) return LOCKED;
  const result = await toResult(() => tableActions.updateSection(input));
  if (result.ok) revalidatePath("/partner/tables");
  return result as { ok: true } | { ok: false; error: string };
}

export async function archiveSectionAction(input: {
  id: string;
  restaurantId: string;
  organizationId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isOrgBillingLocked(input.organizationId)) return LOCKED;
  const result = await toResult(() => tableActions.archiveSection(input));
  if (result.ok) revalidatePath("/partner/tables");
  return result as { ok: true } | { ok: false; error: string };
}
