import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { isDemoMode } from "@/lib/demo-mode";

export default function robots(): MetadataRoute.Robots {
  // Demo deployment: disallow the entire site and advertise no sitemap. The
  // authoritative noindex signal is the proxy's X-Robots-Tag header (robots.txt
  // alone doesn't prevent indexing of linked URLs); this is the belt-and-braces.
  if (isDemoMode()) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/partner/", "/onboard/", "/reservations/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
