import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs";

const supabaseHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "*.supabase.co";
  try {
    return new URL(url).hostname;
  } catch {
    return "*.supabase.co";
  }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  // Allow photo uploads through server actions up to 12 MB (app-level limit
  // is 10 MB per file; the extra headroom covers multipart encoding).
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    // Next.js 16 blocks image optimization of private IPs (127.0.0.1, 10.*,
    // etc.) by default — needed for local Supabase Storage in dev.
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: supabaseHost },
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
    ],
  },
};

const withMDX = createMDX({});

// Sentry: source-map upload requires SENTRY_AUTH_TOKEN. Without it the
// wrapper is harmless — build proceeds, but stack traces in Sentry show
// minified frames. The org/project slugs come from env so the same code
// works for prod (tavli) and any future projects.
export default withSentryConfig(withMDX(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Upload source maps from the build but delete them from the deployed
  // client bundle (keeps stack traces resolvable in Sentry without
  // leaking source to browsers).
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
