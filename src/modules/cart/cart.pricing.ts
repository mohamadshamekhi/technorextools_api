import type { PriceTier } from '@prisma/client';

/**
 * Resolve the effective unit price (integer Toman) for a variant at a given
 * quantity: the variant override (or product base price) unless a bulk
 * price-tier ladder entry with `minQty <= qty` applies — the highest such tier
 * wins.
 */
export function resolveUnitPrice(
  basePrice: number,
  priceOverride: number | null,
  priceTiers: Pick<PriceTier, 'minQty' | 'unitPrice'>[],
  qty: number,
): number {
  const base = priceOverride ?? basePrice;
  const tier = [...priceTiers]
    .filter((t) => qty >= t.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
  return tier ? tier.unitPrice : base;
}
