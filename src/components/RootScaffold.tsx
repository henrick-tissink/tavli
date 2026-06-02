import { Inter, Fraunces } from "next/font/google";
import { Toaster } from "@/components/toast";
import { CookieFootnote } from "@/components/legal/cookie-footnote";
import { SiteFooter } from "@/components/site-footer";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/locale";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});
const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces",
});

/** Shared <html>/<body> chrome. `lang` differs per root layout. */
export function RootScaffold({
  lang,
  children,
}: {
  lang: string;
  children: React.ReactNode;
}) {
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  return (
    <html lang={lang} className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans">
        {children}
        <SiteFooter locale={locale} />
        <Toaster lang={locale} />
        <CookieFootnote locale={locale} />
      </body>
    </html>
  );
}
