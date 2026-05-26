import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
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

export const metadata: Metadata = {
  title: "Tavli — Găsește-ți masa",
  description: "Descoperă și rezervă restaurante din România",
  verification: {
    google: "qv3pydAGHoDHw7x-3LSbJRM99HuuBxD5HCVpvMROJmE",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans">
        {children}
        <SiteFooter />
        <Toaster />
        <CookieFootnote />
      </body>
    </html>
  );
}
