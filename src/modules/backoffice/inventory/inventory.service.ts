import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import type {
  ListVariantsQuery,
  ReplacePriceTiersInput,
  UpdateInventoryVariantInput,
} from './inventory.schemas';

export interface InventoryVariantView {
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  productBasePrice: number;
  sku: string;
  colorName: string | null;
  stockQty: number;
  priceOverride: number | null;
  weightGrams: number | null;
  isActive: boolean;
  priceTiers: Array<{ minQty: number; unitPrice: number }>;
  updatedAt: string;
}

@Injectable()
export class InventoryService {
  constructor(private readonly variants: ProductVariantRepository) {}

  async list(
    query: ListVariantsQuery,
  ): Promise<{ items: InventoryVariantView[]; total: number; skip: number; take: number }> {
    const and: Prisma.ProductVariantWhereInput[] = [];
    if (query.productId) and.push({ productId: query.productId });
    if (query.search) and.push({ sku: { contains: query.search } });
    const { items, total } = await this.variants.paginate(
      and.length ? { AND: and } : {},
      query.skip,
      query.take,
    );
    const views = items.map(toView);
    return {
      items: query.lowStock ? views.filter((v) => v.stockQty <= 5) : views,
      total,
      skip: query.skip,
      take: query.take,
    };
  }

  async updateVariant(
    id: string,
    input: UpdateInventoryVariantInput,
  ): Promise<InventoryVariantView> {
    const variant = await this.variants.findByIdWithProduct(id);
    if (!variant) {
      throw new NotFoundException('واریانت یافت نشد');
    }
    const { priceOverride, weightGrams, ...rest } = input;
    const updated = await this.variants.update(id, {
      ...rest,
      ...(priceOverride !== undefined ? { priceOverride: priceOverride ?? null } : {}),
      ...(weightGrams !== undefined ? { weightGrams: weightGrams ?? null } : {}),
    });
    return toView({ ...variant, ...updated });
  }

  async replacePriceTiers(
    id: string,
    input: ReplacePriceTiersInput,
  ): Promise<InventoryVariantView> {
    const variant = await this.variants.findByIdWithProduct(id);
    if (!variant) {
      throw new NotFoundException('واریانت یافت نشد');
    }
    const seen = new Set<number>();
    for (const tier of input.tiers) {
      if (seen.has(tier.minQty)) {
        throw new BadRequestException('هر حداقل تعداد فقط یک بار باید تعریف شود');
      }
      seen.add(tier.minQty);
    }
    await this.variants.replacePriceTiers(id, input.tiers);
    const fresh = await this.variants.findByIdWithPriceTiers(id);
    return toView({ ...variant, ...(fresh ?? variant) });
  }
}

type VariantRow = NonNullable<
  Awaited<ReturnType<ProductVariantRepository['findByIdWithProduct']>>
> & {
  priceTiers?: Array<{ minQty: number; unitPrice: number }>;
};

function toView(variant: VariantRow): InventoryVariantView {
  return {
    id: variant.id,
    productId: variant.productId,
    productTitle: variant.product.title,
    productSlug: variant.product.slug,
    productBasePrice: variant.product.basePrice,
    sku: variant.sku,
    colorName: variant.colorName,
    stockQty: variant.stockQty,
    priceOverride: variant.priceOverride,
    weightGrams: variant.weightGrams,
    isActive: variant.isActive,
    priceTiers: variant.priceTiers ?? [],
    updatedAt: variant.updatedAt.toISOString(),
  };
}
