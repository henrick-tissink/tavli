import { Inter, Fraunces } from "next/font/google";
import { Toaster } from "@/components/toast";
import { CookieFootnote } from "@/components/legal/cookie-footnote";
import { SiteFooter } from "@/components/site-footer";

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
  return (
    <html lang={lang} className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans">
        {children}
        <SiteFooter />
        <Toaster />
        <CookieFootnote />
      </body>
    </html>
  );
}
