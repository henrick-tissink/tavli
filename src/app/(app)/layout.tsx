import type { Metadata } from "next";
import { RootScaffold } from "@/components/RootScaffold";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import "@/app/globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveAppLocale();
  const meta = getMessages(locale, "common").meta;
  return {
    title: meta.title,
    description: meta.description,
    verification: { google: "qv3pydAGHoDHw7x-3LSbJRM99HuuBxD5HCVpvMROJmE" },
  };
}

export default async function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await resolveAppLocale();
  return <RootScaffold lang={locale}>{children}</RootScaffold>;
}
