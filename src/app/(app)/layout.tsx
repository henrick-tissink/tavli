import { RootScaffold } from "@/components/RootScaffold";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { siteMetadata } from "@/lib/site-metadata";
import "@/app/globals.css";

export { siteMetadata as metadata };

export default async function AppRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await resolveAppLocale();
  return <RootScaffold lang={locale}>{children}</RootScaffold>;
}
