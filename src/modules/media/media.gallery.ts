import type { Media, MediaPurpose } from '@prisma/client';

/** Flat image shape the catalog views expose (replaces the old `ProductImage`). */
export interface GalleryImage {
  id: string;
  url: string;
  alt: string | null;
  isMain: boolean;
  sortOrder: number;
  /** Set when the image is owned by a variant rather than the product itself. */
  variantId: string | null;
}

/** `GALLERY`-purpose rows → the flat gallery shape, order preserved. */
export function toGalleryImages(rows: Media[]): GalleryImage[] {
  return rows
    .filter((m) => m.purpose === 'GALLERY')
    .map((m) => ({
      id: m.id,
      url: m.url,
      alt: m.alt,
      isMain: m.isMain,
      sortOrder: m.sortOrder,
      variantId: m.ownerType === 'PRODUCT_VARIANT' ? m.ownerId : null,
    }));
}

/** First URL of the given purpose, or null. */
export function firstUrlOf(rows: Media[], purpose: MediaPurpose): string | null {
  return rows.find((m) => m.purpose === purpose)?.url ?? null;
}

/** Main gallery URL — the `isMain` one, else the first. */
export function mainImageUrlOf(rows: Media[]): string | null {
  const gallery = toGalleryImages(rows);
  return gallery.find((g) => g.isMain)?.url ?? gallery[0]?.url ?? null;
}
