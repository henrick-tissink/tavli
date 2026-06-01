"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { type Locale } from "@/lib/i18n/locale";
import { setLocaleCookie } from "@/lib/i18n/cookie";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { profiles } from "@/lib/db/schema";

/** Set the app locale: cookie always; profiles.locale when signed in. */
export async function setAppLocale(locale: Locale) {
  await setLocaleCookie(locale);
  const session = await getCurrentSession();
  if (session) {
    await dbAdmin.update(profiles).set({ locale }).where(eq(profiles.id, session.userId));
  }
  revalidatePath("/", "layout");
}
