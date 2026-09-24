import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BundleRepository,
  type BundleDetailRow,
} from '../../bundles/repositories/bundle.repository';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';

interface BundleInput {
  title?: string;
  slug?: string;
  description?: string | null;
  bundlePrice?: number;
  isActive?: boolean;
  items?: Array<{ variantId: string; qty: number }>;
}

function toView(b: BundleDetailRow) {
  return {
    id: b.id,
    title: b.title,
    slug: b.slug,
    description: b.description,
    bundlePrice: b.bundlePrice,
    isActive: b.isActive,
    items: b.items.map((i) => ({
      variantId: i.variantId,
      qty: i.qty,
      sku: i.variant.sku,
      productTitle: i.variant.product.title,
    })),
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
    return rows.map(toView);
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
    await this.assertVariants(input.items);
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
    return toView(created);
  }

  async update(id: string, input: BundleInput) {
    await this.getById(id);
    if (input.items) await this.assertVariants(input.items);
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
    return toView(updated);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.bundles.delete(id);
  }

  private async assertVariants(items: Array<{ variantId: string; qty: number }>): Promise<void> {
    for (const item of items) {
      const variant = await this.variants.findById(item.variantId);
      if (!variant) throw new BadRequestException(`واریانت ${item.variantId} یافت نشد`);
    }
  }
}
