import { notFound } from "next/navigation";
import { isServedCity } from "@/lib/repos/cities-repo";

/**
 * Gate for every `[city]` route — the feed, map, saved, profile, restaurant
 * detail, menu and events pages all sit under this segment, so validating the
 * slug once here covers them all. Without it `[city]` matched anything and
 * title-cased the slug into a real-looking page.
 *
 * Pass-through otherwise: the shell chrome lives in `(shell)/layout.tsx`.
 */
export default async function CityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string; city: string }>;
}) {
  const { city } = await params;
  if (!(await isServedCity(city))) notFound();
  return children;
}
