import type { NextConfig } from "next";
import createMDX from "@next/mdx";

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
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: supabaseHost },
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
    ],
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
