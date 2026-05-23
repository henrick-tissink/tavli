/**
 * @jest-environment node
 *
 * stripExif — Wave 4 §05 §5.1 sub-unit I.1.
 * Verifies EXIF metadata is stripped while image dimensions are preserved.
 */

import { stripExif } from "../strip-exif";
import sharp from "sharp";

describe("stripExif", () => {
  it("removes EXIF metadata", async () => {
    // Create a test image WITH EXIF
    const withExif = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Make: "TestCamera" } } })
      .toBuffer();

    const stripped = await stripExif(withExif);
    const meta = await sharp(stripped).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("preserves image dimensions", async () => {
    const orig = await sharp({
      create: {
        width: 200,
        height: 150,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();
    const stripped = await stripExif(orig);
    const meta = await sharp(stripped).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });
});
