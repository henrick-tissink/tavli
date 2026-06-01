import { redirect } from "next/navigation";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale";

export default async function Home({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const l = isLocale(lang) ? lang : DEFAULT_LOCALE;
  redirect(l === DEFAULT_LOCALE ? "/bucuresti" : `/${l}/bucuresti`);
}
