import sharp from 'sharp';

/** contentTypes we re-encode to WebP on upload. */
export const WEBP_CONVERTIBLE_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
]);

/** WebP encoder quality (0–100). 82 keeps files small with no visible loss for product photos. */
const WEBP_QUALITY = 82;

/** How many times to attempt the encode before giving up. */
const MAX_ATTEMPTS = 2;

/**
 * Re-encode a JPEG/PNG buffer to WebP. `.rotate()` bakes in the EXIF orientation
 * (WebP has no orientation tag). Retries once on a transient encoder failure;
 * a genuinely corrupt image throws after the last attempt.
 */
export async function convertToWebp(buffer: Buffer): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await sharp(buffer, { failOn: 'error' })
        .rotate()
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('WebP conversion failed');
}
