import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Brand } from '@prisma/client';
import { BrandRepository } from '../../catalog/repositories/brand.repository';
import { ProductRepository } from '../../catalog/repositories/product.repository';
import type { CreateBrandInput, UpdateBrandInput } from './brands.schemas';

export interface BrandView {
  id: string;
  title: string;
  slug: string;
  logoUrl: string | null;
  isExclusiveDistributor: boolean;
  authenticityNote: string | null;
  productsCount: number;
  createdAt: string;
}

@Injectable()
export class BrandsService {
  constructor(
    private readonly brands: BrandRepository,
    private readonly products: ProductRepository,
  ) {}

  async list(): Promise<BrandView[]> {
    const rows = await this.brands.findMany();
    return rows.map(toView);
  }

  async getById(id: string): Promise<BrandView> {
    const brand = await this.brands.findByIdWithCount(id);
    if (!brand) {
      throw new NotFoundException('برند یافت نشد');
    }
    return toView(brand);
  }

  async create(input: CreateBrandInput): Promise<BrandView> {
    await this.ensureSlugFree(input.slug);
    const brand = await this.brands.create({
      title: input.title,
      slug: input.slug,
      logoUrl: input.logoUrl ?? undefined,
      isExclusiveDistributor: input.isExclusiveDistributor,
      authenticityNote: input.authenticityNote ?? undefined,
    });
    return toView({ ...brand, _count: { products: 0 } });
  }

  async update(id: string, input: UpdateBrandInput): Promise<BrandView> {
    const brand = await this.brands.findByIdWithCount(id);
    if (!brand) {
      throw new NotFoundException('برند یافت نشد');
    }
    if (input.slug && input.slug !== brand.slug) {
      await this.ensureSlugFree(input.slug);
    }
    const { logoUrl, authenticityNote, ...rest } = input;
    const updated = await this.brands.update(id, {
      ...rest,
      // explicit null clears the field; undefined means "not sent"
      ...(logoUrl !== undefined ? { logoUrl: logoUrl ?? null } : {}),
      ...(authenticityNote !== undefined ? { authenticityNote: authenticityNote ?? null } : {}),
    });
    return toView({ ...updated, _count: brand._count });
  }

  async delete(id: string): Promise<void> {
    const brand = await this.brands.findById(id);
    if (!brand) {
      throw new NotFoundException('برند یافت نشد');
    }
    if (await this.products.countByBrandId(id)) {
      throw new ConflictException('به این برند محصول متصل است و حذف نمی‌شود');
    }
    await this.brands.delete(id);
  }

  private async ensureSlugFree(slug: string): Promise<void> {
    const existing = await this.brands.findBySlug(slug);
    if (existing) {
      throw new ConflictException('این اسلاگ قبلاً استفاده شده');
    }
  }
}

type BrandWithCount = Brand & { _count: { products: number } };

function toView(brand: BrandWithCount): BrandView {
  return {
    id: brand.id,
    title: brand.title,
    slug: brand.slug,
    logoUrl: brand.logoUrl,
    isExclusiveDistributor: brand.isExclusiveDistributor,
    authenticityNote: brand.authenticityNote,
    productsCount: brand._count.products,
    createdAt: brand.createdAt.toISOString(),
  };
}
