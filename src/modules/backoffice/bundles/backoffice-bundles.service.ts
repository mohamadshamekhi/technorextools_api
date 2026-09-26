import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { bundleAvailability } from '../../bundles/bundle.availability';
import {
  BundleRepository,
  type BundleDetailRow,
} from '../../bundles/repositories/bundle.repository';
import {
  ProductVariantRepository,
  type BundleMemberVariant,
} from '../../catalog/repositories/product-variant.repository';

/** Non-blocking problems reported alongside a saved bundle. */
export interface BundleWarning {
  code: 'BUNDLE_ITEM_OUT_OF_STOCK';
  variantId: string;
  sku: string;
  stockQty: number;
  requiredQty: number;
}

interface BundleInput {
  title?: string;
  slug?: string;
  description?: string | null;
  bundlePrice?: number;
  isActive?: boolean;
  items?: Array<{ variantId: string; qty: number }>;
}

function toView(b: BundleDetailRow, warnings: BundleWarning[] = []) {
  // Same verdict the storefront shows, so the panel can explain why a pack is hidden.
  const { available, packagesInStock } = bundleAvailability(b);
  return {
    id: b.id,
    title: b.title,
    slug: b.slug,
    description: b.description,
    bundlePrice: b.bundlePrice,
    isActive: b.isActive,
    available,
    packagesInStock,
    items: b.items.map((i) => ({
      variantId: i.variantId,
      qty: i.qty,
      sku: i.variant.sku,
      productTitle: i.variant.product.title,
      stockQty: i.variant.stockQty,
      isActive:
        i.variant.isActive && i.variant.product.isActive && i.variant.product.deletedAt === null,
    })),
    warnings,
  };
}

@Injectable()
export class BackofficeBundlesService {
  constructor(
    private readonly bundles: BundleRepository,
    private readonly variants: ProductVariantRepository,
  ) {}

  async list() {
    const rows = await this.bundles.findMany();
    return rows.map((row) => toView(row));
  }

  async getById(id: string) {
    const bundle = await this.bundles.findById(id);
    if (!bundle) throw new NotFoundException('پکیج یافت نشد');
    return toView(bundle);
  }

  async create(
    input: BundleInput & {
      title: string;
      slug: string;
      bundlePrice: number;
      items: Array<{ variantId: string; qty: number }>;
    },
  ) {
    if (await this.bundles.findBySlug(input.slug)) {
      throw new BadRequestException('این اسلاگ قبلاً استفاده شده است');
    }
    const warnings = await this.assertVariants(input.items);
    const created = await this.bundles.create(
      {
        title: input.title,
        slug: input.slug,
        description: input.description ?? null,
        bundlePrice: input.bundlePrice,
        isActive: input.isActive ?? true,
      },
      input.items,
    );
    return toView(created, warnings);
  }

  async update(id: string, input: BundleInput) {
    await this.getById(id);
    const warnings = input.items ? await this.assertVariants(input.items) : [];
    const updated = await this.bundles.update(
      id,
      {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.bundlePrice !== undefined ? { bundlePrice: input.bundlePrice } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      input.items,
    );
    return toView(updated, warnings);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.bundles.delete(id);
  }

  /**
   * Members must exist and be orderable, otherwise the pack would publish as
   * `available: false` with nothing telling the admin why. Being out of stock is
   * temporary, so it only warns — it never blocks the save.
   */
  private async assertVariants(
    items: Array<{ variantId: string; qty: number }>,
  ): Promise<BundleWarning[]> {
    const rows = await this.variants.findManyByIdsWithStatus(items.map((i) => i.variantId));
    const byId = new Map<string, BundleMemberVariant>(rows.map((v) => [v.id, v]));

    const warnings: BundleWarning[] = [];
    for (const item of items) {
      const variant = byId.get(item.variantId);
      if (!variant) throw new BadRequestException(`واریانت ${item.variantId} یافت نشد`);
      if (!variant.isActive || !variant.product.isActive || variant.product.deletedAt !== null) {
        throw new BadRequestException({
          message: `«${variant.product.title}» (کد ${variant.sku}) غیرفعال یا حذف‌شده است و نمی‌تواند عضو پکیج باشد`,
          details: {
            code: 'BUNDLE_ITEM_INACTIVE',
            variantId: variant.id,
            sku: variant.sku,
            productTitle: variant.product.title,
          },
        });
      }
      if (variant.stockQty < item.qty) {
        warnings.push({
          code: 'BUNDLE_ITEM_OUT_OF_STOCK',
          variantId: variant.id,
          sku: variant.sku,
          stockQty: variant.stockQty,
          requiredQty: item.qty,
        });
      }
    }
    return warnings;
  }
}
