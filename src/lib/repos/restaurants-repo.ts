/**
 * Single entry point for reading restaurant data in consumer code paths.
 *
 * Today this delegates to the static mock data in src/lib/mock-data.ts
 * so nothing about the consumer app changes. When USE_DB=true and the
 * consumer pages have been refactored to server components (Phase 2 M3.5),
 * implementations here will switch to querying Supabase. Callers import
 * from this module, not from mock-data, so the swap is a one-file change.
 *
 * Keep function signatures synchronous until that refactor — consumer
 * components are currently client components and can't await in render.
 */

import type { Restaurant, RestaurantDetail, Menu } from "@/lib/types";
import * as mock from "@/lib/mock-data";
import * as menuMock from "@/lib/menu-data";

const USE_DB = process.env.NEXT_PUBLIC_USE_DB === "true";

function warnDbNotImplemented(op: string): never {
  throw new Error(
    `[restaurants-repo] ${op}: USE_DB=true but live DB reads require the M3.5 async-refactor (consumer pages → server components). Keep USE_DB=false for now.`,
  );
}

export function getRestaurants(): Restaurant[] {
  if (USE_DB) warnDbNotImplemented("getRestaurants");
  return mock.getRestaurants();
}

export function getTrendingRestaurants(): Restaurant[] {
  if (USE_DB) warnDbNotImplemented("getTrendingRestaurants");
  return mock.getTrendingRestaurants();
}

export function getNewRestaurants(): Restaurant[] {
  if (USE_DB) warnDbNotImplemented("getNewRestaurants");
  return mock.getNewRestaurants();
}

export function getOpenNowRestaurants(): Restaurant[] {
  if (USE_DB) warnDbNotImplemented("getOpenNowRestaurants");
  return mock.getOpenNowRestaurants();
}

export function getRestaurantBySlug(slug: string): Restaurant | null {
  if (USE_DB) warnDbNotImplemented("getRestaurantBySlug");
  return mock.getRestaurantBySlug(slug);
}

export function getRestaurantDetail(slug: string): RestaurantDetail | null {
  if (USE_DB) warnDbNotImplemented("getRestaurantDetail");
  return mock.getRestaurantDetail(slug);
}

export function getCardReviewData(slug: string) {
  if (USE_DB) warnDbNotImplemented("getCardReviewData");
  return mock.getCardReviewData(slug);
}

export function getMenu(slug: string): Menu | null {
  if (USE_DB) warnDbNotImplemented("getMenu");
  return menuMock.getMenu(slug);
}

export function hasMenu(slug: string): boolean {
  if (USE_DB) warnDbNotImplemented("hasMenu");
  return menuMock.hasMenu(slug);
}
