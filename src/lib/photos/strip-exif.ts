import "server-only";
import sharp from "sharp";

/**
 * stripExif — removes all EXIF metadata from an image buffer while
 * preserving orientation (rotation tag is applied first so the visual
 * orientation is baked into pixels). Per foundations §9 + §05 §5.1.
 *
 * Returns a new Buffer; the input is unchanged. Throws if sharp can't
 * parse the input as a known image format.
 */
export async function stripExif(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()            // applies the EXIF orientation tag to pixels, then discards the tag
    .keepIccProfile()    // preserve ICC color profile for color accuracy; all EXIF is stripped
    .toBuffer();
}
