import type { NextConfig } from "next";

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

export default nextConfig;
