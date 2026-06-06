/**
 * Pure geometry for the floor-plan editor viewport. The editor renders tables at
 * absolute coordinates; these helpers size the scrollable "world" to the actual
 * layout (so no table is ever clipped/unreachable) and compute a fit-to-content
 * zoom so the whole plan is visible at once.
 */

export interface Box {
  positionX: number;
  positionY: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * The world (scrollable canvas) must contain every table plus a margin, and be
 * at least a comfortable minimum so a small/empty plan still looks like a floor.
 * Grows organically as tables move outward.
 */
export function worldBounds(
  tables: Box[],
  pad = 120,
  min: Size = { width: 1000, height: 560 },
): Size {
  let maxRight = 0;
  let maxBottom = 0;
  for (const t of tables) {
    maxRight = Math.max(maxRight, t.positionX + t.width);
    maxBottom = Math.max(maxBottom, t.positionY + t.height);
  }
  return {
    width: Math.max(min.width, maxRight + pad),
    height: Math.max(min.height, maxBottom + pad),
  };
}

/** Largest zoom (≤ max) at which the whole world fits the viewport. Never
 *  upscales past `max`; clamped to `min` so a huge plan stays usable. */
export function fitZoom(
  world: Size,
  viewport: Size,
  opts: { min: number; max: number } = { min: 0.2, max: 1 },
): number {
  if (world.width <= 0 || world.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return opts.max;
  }
  const z = Math.min(viewport.width / world.width, viewport.height / world.height);
  return Math.max(opts.min, Math.min(opts.max, z));
}

/** Clamp a manual zoom level to the editor's allowed range. */
export function clampZoom(z: number, min = 0.2, max = 2): number {
  return Math.max(min, Math.min(max, z));
}
