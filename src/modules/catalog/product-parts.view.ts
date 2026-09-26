import type { ProductPart } from '@prisma/client';

/** Exploded-view part as exposed to both backoffice and storefront. */
export interface ProductPartView {
  number: number;
  name: string;
  code: string;
  sellable: boolean;
  hotspot: { x: number; y: number } | null;
}

/** Map embedded parts to views, ordered by their exploded-view number. */
export function toPartViews(parts: ProductPart[]): ProductPartView[] {
  return [...parts]
    .sort((a, b) => a.number - b.number)
    .map((p) => ({
      number: p.number,
      name: p.name,
      code: p.code,
      sellable: p.sellable,
      hotspot: p.hotspot ? { x: p.hotspot.x, y: p.hotspot.y } : null,
    }));
}
