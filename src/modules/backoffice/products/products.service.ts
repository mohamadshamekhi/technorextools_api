import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Media, Prisma, ProductVariant } from '@prisma/client';
import {
  ProductRepository,
  type ProductFullRow,
  type ProductListRow,
} from '../../catalog/repositories/product.repository';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { AttributeGroupRepository } from '../../catalog/repositories/attribute-group.repository';
import { CategoryRepository } from '../../catalog/repositories/category.repository';
import { BrandRepository } from '../../catalog/repositories/brand.repository';
import { MediaRepository } from '../../media/repositories/media.repository';
import {
  firstUrlOf,
  mainImageUrlOf,
  toGalleryImages,
  type GalleryImage,
} from '../../media/media.gallery';
import type {
  CreateProductInput,
  CreateVariantInput,
  ListProductsQuery,
  ReplaceAttributeValuesInput,
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

export type ProductImageView = GalleryImage;

export interface ProductVariantView {
  id: string;
  sku: string;
  colorName: string | null;
  stockQty: number;
  priceOverride: number | null;
  weightGrams: number | null;
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
  model3dUrl: string | null;
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
    private readonly media: MediaRepository,
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
    const mediaByProduct = await this.galleryByProduct(items.map((p) => p.id));
    return {
      items: items.map((p) => toCardView(p, mediaByProduct.get(p.id) ?? [])),
      total,
      skip: query.skip,
      take: query.take,
    };
  }

  async getById(id: string): Promise<ProductDetail> {
    const product = await this.products.findByIdFull(id);
    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }
    const media = await this.media.findProductMedia(
      id,
      product.variants.map((v) => v.id),
    );
    return toDetail(product, media);
  }

  /** Main-image lookup for a page of product cards, keyed by product id. */
  private async galleryByProduct(ids: string[]): Promise<Map<string, Media[]>> {
    const rows = await this.media.findByOwners('PRODUCT', ids);
    const map = new Map<string, Media[]>();
    for (const row of rows) {
      if (!row.ownerId) continue;
      const list = map.get(row.ownerId);
      if (list) list.push(row);
      else map.set(row.ownerId, [row]);
    }
    return map;
  }

  async create(input: CreateProductInput): Promise<ProductDetail> {
    await this.ensureSlugFree(input.slug);
    await this.ensureCategoryExists(input.categoryId);
    if (input.brandId) {
      await this.ensureBrandExists(input.brandId);
    }
    const { brandId, categoryId, ...rest } = input;
    const product = await this.products.create({
      ...rest,
      ...(brandId ? { brand: { connect: { id: brandId } } } : {}),
      category: { connect: { id: categoryId } },
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
      weightGrams: input.weightGrams,
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
    const { colorName, weightGrams, ...rest } = input;
    const updated = await this.variants.update(variantId, {
      ...rest,
      ...(colorName !== undefined ? { colorName: colorName ?? null } : {}),
      ...(weightGrams !== undefined ? { weightGrams: weightGrams ?? null } : {}),
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

function toCardView(product: ProductListRow, media: Media[]): ProductCardView {
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
    mainImageUrl: mainImageUrlOf(media),
    createdAt: product.createdAt.toISOString(),
  };
}

function toVariantView(variant: ProductVariant): ProductVariantView {
  return {
    id: variant.id,
    sku: variant.sku,
    colorName: variant.colorName,
    stockQty: variant.stockQty,
    priceOverride: variant.priceOverride,
    weightGrams: variant.weightGrams,
    isActive: variant.isActive,
  };
}

function toDetail(product: ProductFullRow, media: Media[]): ProductDetail {
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    shortDesc: product.shortDesc,
    description: product.description,
    basePrice: product.basePrice,
    isAmazingDeal: product.isAmazingDeal,
    datasheetUrl: firstUrlOf(media, 'DATASHEET'),
    model3dUrl: firstUrlOf(media, 'MODEL_3D'),
    isActive: product.isActive,
    deletedAt: product.deletedAt?.toISOString() ?? null,
    category: product.category,
    brand: product.brand,
    images: toGalleryImages(media),
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
