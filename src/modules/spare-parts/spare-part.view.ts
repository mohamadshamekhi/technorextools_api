import type { Media } from '@prisma/client';
import { mainImageUrlOf, toGalleryImages, type GalleryImage } from '../media/media.gallery';
import type { SparePartDetailRow } from './repositories/spare-part.repository';

export interface SparePartView {
  id: string;
  title: string;
  slug: string;
  partNumber: string | null;
  shortDesc: string | null;
  description: string | null;
  price: number;
  stockQty: number;
  weightGrams: number | null;
  isActive: boolean;
  mainImageUrl: string | null;
  images: GalleryImage[];
  compatibleProducts: Array<{ id: string; title: string; slug: string }>;
}

/** `compatibleProducts` lists only live products when `publicOnly` (storefront). */
export function toSparePartView(
  row: SparePartDetailRow,
  media: Media[],
  publicOnly = false,
): SparePartView {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    partNumber: row.partNumber,
    shortDesc: row.shortDesc,
    description: row.description,
    price: row.price,
    stockQty: row.stockQty,
    weightGrams: row.weightGrams,
    isActive: row.isActive,
    mainImageUrl: mainImageUrlOf(media),
    images: toGalleryImages(media),
    compatibleProducts: row.compatibleProducts
      .map((c) => c.product)
      .filter((p) => !publicOnly || (p.isActive && p.deletedAt === null))
      .map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
  };
}
