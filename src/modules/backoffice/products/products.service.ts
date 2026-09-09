import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, ProductImage, ProductVariant } from '@prisma/client';
import {
  ProductRepository,
  type ProductFullRow,
  type ProductListRow,
} from '../../catalog/repositories/product.repository';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { AttributeGroupRepository } from '../../catalog/repositories/attribute-group.repository';
import { CategoryRepository } from '../../catalog/repositories/category.repository';
import { BrandRepository } from '../../catalog/repositories/brand.repository';
import type {
  CreateProductInput,
  CreateVariantInput,
  ListProductsQuery,
  ReplaceAttributeValuesInput,
  ReplaceImagesInput,
  ReplaceRelatedInput,
  UpdateProductInput,
  UpdateProductVariantInput,
} from './products.schemas';

export interface ProductCardView {
  id: string;
  title: string;
  slug: string;
  basePrice: number;
  isAmazingDeal: boolean;
  isActive: boolean;
  category: { id: string; title: string; slug: string };
  brand: { id: string; title: string; slug: string } | null;
  mainImageUrl: string | null;
  createdAt: string;
}

export interface ProductImageView {
  id: string;
  url: string;
  variantId: string | null;
  isMain: boolean;
  sortOrder: number;
}

export interface ProductVariantView {
  id: string;
  sku: string;
  colorName: string | null;
  stockQty: number;
  priceOverride: number | null;
  isActive: boolean;
}

export interface ProductDetail {
  id: string;
  title: string;
  slug: string;
  shortDesc: string | null;
  description: string | null;
  basePrice: number;
  isAmazingDeal: boolean;
  datasheetUrl: string | null;
  isActive: boolean;
  deletedAt: string | null;
  category: { id: string; title: string; slug: string };
  brand: { id: string; title: string; slug: string } | null;
  images: ProductImageView[];
  variants: ProductVariantView[];
  attributeValues: Array<{
    attributeId: string;
    attributeTitle: string;
    value: string;
    unit: string | null;
  }>;
  relatedProductIds: string[];
  createdAt: string;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductRepository,
    private readonly variants: ProductVariantRepository,
    private readonly categories: CategoryRepository,
    private readonly brands: BrandRepository,
    private readonly attributeGroups: AttributeGroupRepository,
  ) {}

  async list(
    query: ListProductsQuery,
  ): Promise<{ items: ProductCardView[]; total: number; skip: number; take: number }> {
    const and: Prisma.ProductWhereInput[] = [{ deletedAt: null }];
    if (query.search) {
      and.push({
        OR: [{ title: { contains: query.search } }, { slug: { contains: query.search } }],
      });
    }
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.brandId) and.push({ brandId: query.brandId });
    if (query.isActive !== undefined) and.push({ isActive: query.isActive });
    if (query.isAmazingDeal !== undefined) and.push({ isAmazingDeal: query.isAmazingDeal });
    const { items, total } = await this.products.paginate({ AND: and }, query.skip, query.take);
    return { items: items.map(toCardView), total, skip: query.skip, take: query.take };
  }

  async getById(id: string): Promise<ProductDetail> {
    const product = await this.products.findByIdFull(id);
    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }
    return toDetail(product);
  }

  async create(input: CreateProductInput): Promise<ProductDetail> {
    await this.ensureSlugFree(input.slug);
    await this.ensureCategoryExists(input.categoryId);
    if (input.brandId) {
      await this.ensureBrandExists(input.brandId);
    }
    const { brandId, ...rest } = input;
    const product = await this.products.create({
      ...rest,
      ...(brandId ? { brand: { connect: { id: brandId } } } : {}),
      category: { connect: { id: input.categoryId } },
    });
    return this.getById(product.id);
  }

  async update(id: string, input: UpdateProductInput): Promise<ProductDetail> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }
    if (input.slug && input.slug !== product.slug) {
      await this.ensureSlugFree(input.slug);
    }
    if (input.categoryId && input.categoryId !== product.categoryId) {
      await this.ensureCategoryExists(input.categoryId);
    }
    if (input.brandId && input.brandId !== product.brandId) {
      await this.ensureBrandExists(input.brandId);
    }
    const { brandId, categoryId, ...rest } = input;
    await this.products.update(id, {
      ...rest,
      ...(categoryId && categoryId !== product.categoryId
        ? { category: { connect: { id: categoryId } } }
        : {}),
      ...(brandId !== undefined && brandId !== product.brandId
        ? { brand: brandId ? { connect: { id: brandId } } : { disconnect: true } }
        : {}),
    });
    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }
    await this.products.softDelete(id);
  }

  async replaceImages(id: string, input: ReplaceImagesInput): Promise<ProductImageView[]> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }
    const productVariants = await this.variants.findManyByProductId(id);
    const variantIds = new Set(productVariants.map((v) => v.id));
    for (const image of input.images) {
      if (image.variantId && !variantIds.has(image.variantId)) {
        throw new BadRequestException('تصویر به واریانتی اشاره می‌کند که به این محصول تعلق ندارد');
      }
    }
    await this.products.replaceImages(id, input.images);
    const fresh = await this.products.findByIdFull(id);
    return fresh ? fresh.images.map(toImageView) : [];
  }

  async replaceAttributeValues(
    id: string,
    input: ReplaceAttributeValuesInput,
  ): Promise<ProductDetail['attributeValues']> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }
    const groups = await this.attributeGroups.findByCategoryId(product.categoryId);
    const validAttributeIds = new Set(groups.flatMap((g) => g.attributes.map((a) => a.id)));
    const seen = new Set<string>();
    for (const value of input.values) {
      if (!validAttributeIds.has(value.attributeId)) {
        throw new BadRequestException('ویژگی واردشده به خانواده ویژگی این دسته‌بندی تعلق ندارد');
      }
      if (seen.has(value.attributeId)) {
        throw new BadRequestException('هر ویژگی فقط یک بار باید مقدار بگیرد');
      }
      seen.add(value.attributeId);
    }
    await this.products.replaceAttributeValues(id, input.values);
    const detail = await this.getById(id);
    return detail.attributeValues;
  }

  async replaceRelated(id: string, input: ReplaceRelatedInput): Promise<ProductDetail> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }
    const ids = [...new Set(input.relatedProductIds)];
    if (ids.includes(id)) {
      throw new BadRequestException('محصول نمی‌تواند مرتبط خودش باشد');
    }
    if (ids.length > 0 && (await this.products.countByIds(ids)) !== ids.length) {
      throw new BadRequestException('یکی از محصولات مرتبط وجود ندارد');
    }
    await this.products.replaceRelated(id, ids);
    return this.getById(id);
  }

  async createVariant(productId: string, input: CreateVariantInput): Promise<ProductVariantView> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }
    await this.ensureSkuFree(input.sku);
    const variant = await this.variants.create({
      sku: input.sku,
      colorName: input.colorName ?? undefined,
      stockQty: input.stockQty,
      priceOverride: input.priceOverride,
      isActive: input.isActive,
      product: { connect: { id: productId } },
    });
    return toVariantView(variant);
  }

  async updateVariant(
    productId: string,
    variantId: string,
    input: UpdateProductVariantInput,
  ): Promise<ProductVariantView> {
    const variant = await this.variants.findById(variantId);
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException('واریانت یافت نشد');
    }
    if (input.sku && input.sku !== variant.sku) {
      await this.ensureSkuFree(input.sku);
    }
    const { colorName, ...rest } = input;
    const updated = await this.variants.update(variantId, {
      ...rest,
      ...(colorName !== undefined ? { colorName: colorName ?? null } : {}),
    });
    return toVariantView(updated);
  }

  private async ensureSlugFree(slug: string): Promise<void> {
    const existing = await this.products.findBySlug(slug);
    if (existing) {
      throw new ConflictException('این اسلاگ قبلاً استفاده شده');
    }
  }

  private async ensureSkuFree(sku: string): Promise<void> {
    const existing = await this.variants.findBySku(sku);
    if (existing) {
      throw new ConflictException('این SKU قبلاً استفاده شده');
    }
  }

  private async ensureCategoryExists(id: string): Promise<void> {
    if (!(await this.categories.findById(id))) {
      throw new BadRequestException('دسته‌بندی انتخاب‌شده وجود ندارد');
    }
  }

  private async ensureBrandExists(id: string): Promise<void> {
    if (!(await this.brands.findById(id))) {
      throw new BadRequestException('برند انتخاب‌شده وجود ندارد');
    }
  }
}

function toCardView(product: ProductListRow): ProductCardView {
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    basePrice: product.basePrice,
    isAmazingDeal: product.isAmazingDeal,
    isActive: product.isActive,
    category: {
      id: product.categoryId,
      title: product.category.title,
      slug: product.category.slug,
    },
    brand: product.brand,
    mainImageUrl: product.images.find((img) => img.isMain)?.url ?? product.images[0]?.url ?? null,
    createdAt: product.createdAt.toISOString(),
  };
}

function toImageView(image: ProductImage): ProductImageView {
  return {
    id: image.id,
    url: image.url,
    variantId: image.variantId,
    isMain: image.isMain,
    sortOrder: image.sortOrder,
  };
}

function toVariantView(variant: ProductVariant): ProductVariantView {
  return {
    id: variant.id,
    sku: variant.sku,
    colorName: variant.colorName,
    stockQty: variant.stockQty,
    priceOverride: variant.priceOverride,
    isActive: variant.isActive,
  };
}

function toDetail(product: ProductFullRow): ProductDetail {
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    shortDesc: product.shortDesc,
    description: product.description,
    basePrice: product.basePrice,
    isAmazingDeal: product.isAmazingDeal,
    datasheetUrl: product.datasheetUrl,
    isActive: product.isActive,
    deletedAt: product.deletedAt?.toISOString() ?? null,
    category: product.category,
    brand: product.brand,
    images: product.images.map(toImageView),
    variants: product.variants.map(toVariantView),
    attributeValues: product.attributeValues.map((v) => ({
      attributeId: v.attributeId,
      attributeTitle: v.attribute.title,
      value: v.value,
      unit: v.attribute.unit,
    })),
    relatedProductIds: product.relatedTo.map((r) => r.relatedProductId),
    createdAt: product.createdAt.toISOString(),
  };
}
