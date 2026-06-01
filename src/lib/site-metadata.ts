import type { Metadata } from "next";

/**
 * Canonical site-wide metadata shared by both route-group root layouts.
 * Includes the Google Search Console verification token originally lifted
 * from the deleted top-level app/layout.tsx.
 */
export const siteMetadata: Metadata = {
  title: "Tavli — Găsește-ți masa",
  description: "Descoperă și rezervă restaurante din România",
  verification: {
    google: "qv3pydAGHoDHw7x-3LSbJRM99HuuBxD5HCVpvMROJmE",
  },
};
