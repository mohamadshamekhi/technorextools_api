import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Media, Prisma, ProductDocument, ProductVariant } from '@prisma/client';
import { toPartViews, type ProductPartView } from '../../catalog/product-parts.view';
import {
  toDocumentViews,
  toHighlightViews,
  toModel3dHotspotViews,
  type ProductDocumentView,
  type ProductHighlightView,
  type ProductModel3dHotspotView,
} from '../../catalog/product-extras.view';
import { ProductDocumentRepository } from '../../catalog/repositories/product-document.repository';
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
  BulkUpdatePriceInput,
  CreateProductInput,
  CreateVariantInput,
  ListProductsQuery,
  ReplaceAttributeValuesInput,
  CreateProductDocumentInput,
  ReplaceHighlightsInput,
  ReplaceModel3dHotspotsInput,
  ReplacePartsInput,
  ReplaceRelatedInput,
  UpdateProductDocumentInput,
  UpdateProductInput,
  UpdateProductVariantInput,
} from './products.schemas';

export interface ProductCardView {
  id: string;
  title: string;
  slug: string;
  basePrice: number;
  isAmazingDeal: boolean;
  isFeatured: boolean;
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

export interface BulkPriceUpdateResult {
  matchedProducts: number;
  updatedVariants: number;
}

export interface ProductDetail {
  id: string;
  title: string;
  slug: string;
  shortDesc: string | null;
  description: string | null;
  basePrice: number;
  isAmazingDeal: boolean;
  isFeatured: boolean;
  datasheetUrl: string | null;
  model3dUrl: string | null;
  explodedViewUrl: string | null;
  parts: ProductPartView[];
  highlights: ProductHighlightView[];
  model3dHotspots: ProductModel3dHotspotView[];
  documents: ProductDocumentView[];
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
    private readonly documents: ProductDocumentRepository,
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
    if (query.isFeatured !== undefined) and.push({ isFeatured: query.isFeatured });
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
    const docs = await this.documents.findByProduct(id);
    const docMedia = await this.media.findByIds(docs.map((d) => d.mediaId));
    return toDetail(product, media, docs, docMedia);
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

  /** Replace the whole exploded-view part list; part numbers must be unique per product. */
  async replaceParts(id: string, input: ReplacePartsInput): Promise<ProductDetail> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }
    const numbers = new Set(input.parts.map((p) => p.number));
    if (numbers.size !== input.parts.length) {
      throw new BadRequestException('شماره هر قطعه باید یکتا باشد');
    }
    await this.products.update(id, {
      parts: {
        set: input.parts.map((p) => ({
          number: p.number,
          name: p.name,
          code: p.code,
          sellable: p.sellable,
          hotspot: p.hotspot ?? null,
        })),
      },
    });
    return this.getById(id);
  }

  /** Replace the whole highlight strip (icon cards on the product page). */
  async replaceHighlights(id: string, input: ReplaceHighlightsInput): Promise<ProductDetail> {
    await this.requireProduct(id);
    await this.products.update(id, { highlights: { set: input.highlights } });
    return this.getById(id);
  }

  /** Replace the labelled points on the 3D model; `key` must be unique per product. */
  async replaceModel3dHotspots(
    id: string,
    input: ReplaceModel3dHotspotsInput,
  ): Promise<ProductDetail> {
    await this.requireProduct(id);
    const keys = new Set(input.hotspots.map((h) => h.key));
    if (keys.size !== input.hotspots.length) {
      throw new BadRequestException('کلید هر نقطه باید یکتا باشد');
    }
    await this.products.update(id, {
      model3dHotspots: {
        set: input.hotspots.map((h) => ({
          key: h.key,
          label: h.label,
          description: h.description ?? null,
          x: h.position[0],
          y: h.position[1],
          z: h.position[2],
        })),
      },
    });
    return this.getById(id);
  }

  // ── documents ──────────────────────────────────────────────────────────────

  async listDocuments(productId: string): Promise<ProductDocumentView[]> {
    await this.requireProduct(productId);
    const docs = await this.documents.findByProduct(productId);
    return toDocumentViews(docs, await this.media.findByIds(docs.map((d) => d.mediaId)));
  }

  async addDocument(
    productId: string,
    input: CreateProductDocumentInput,
  ): Promise<ProductDocumentView[]> {
    await this.requireProduct(productId);
    await this.requireMedia(input.mediaId);
    await this.documents.create({ productId, ...input });
    return this.listDocuments(productId);
  }

  async updateDocument(
    productId: string,
    documentId: string,
    input: UpdateProductDocumentInput,
  ): Promise<ProductDocumentView[]> {
    await this.ownedDocument(productId, documentId);
    if (input.mediaId) await this.requireMedia(input.mediaId);
    await this.documents.update(documentId, input);
    return this.listDocuments(productId);
  }

  async deleteDocument(productId: string, documentId: string): Promise<void> {
    await this.ownedDocument(productId, documentId);
    await this.documents.delete(documentId);
  }

  private async requireProduct(id: string): Promise<void> {
    if (!(await this.products.findById(id))) {
      throw new NotFoundException('محصول یافت نشد');
    }
  }

  private async requireMedia(mediaId: string): Promise<void> {
    if (!(await this.media.findById(mediaId))) {
      throw new BadRequestException('فایل انتخاب‌شده وجود ندارد');
    }
  }

  private async ownedDocument(productId: string, documentId: string): Promise<void> {
    const doc = await this.documents.findById(documentId);
    if (!doc || doc.productId !== productId) {
      throw new NotFoundException('سند یافت نشد');
    }
  }

  /**
   * Bulk price change over a brand/category/explicit product set. Every matched product's
   * `basePrice` moves, and so does every variant's `priceOverride` that's actually set —
   * variants have no fallback of their own, so a product with no override-free variant left
   * unchanged would silently keep selling at the old price.
   */
  async bulkUpdatePrices(input: BulkUpdatePriceInput): Promise<BulkPriceUpdateResult> {
    if (input.brandId) await this.ensureBrandExists(input.brandId);
    if (input.categoryId) await this.ensureCategoryExists(input.categoryId);
    if (
      input.productIds &&
      (await this.products.countByIds(input.productIds)) !== input.productIds.length
    ) {
      throw new BadRequestException('یکی از محصولات وارد شده وجود ندارد');
    }

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(input.brandId ? { brandId: input.brandId } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.productIds ? { id: { in: input.productIds } } : {}),
    };
    const products = await this.products.findManyByFilter(where);
    if (products.length === 0) {
      throw new NotFoundException('محصولی با این شرایط یافت نشد');
    }

    const variants = await this.variants.findManyByProductIds(products.map((p) => p.id));
    const apply = (price: number): number =>
      applyPriceChange(price, input.mode, input.direction, input.value);

    const productUpdates = products.map((p) => ({ id: p.id, basePrice: apply(p.basePrice) }));
    const variantUpdates = variants
      .filter((v): v is ProductVariant & { priceOverride: number } => v.priceOverride !== null)
      .map((v) => ({ id: v.id, priceOverride: apply(v.priceOverride) }));

    await this.products.bulkUpdateBasePrices(productUpdates);
    await this.variants.bulkUpdatePriceOverrides(variantUpdates);

    return { matchedProducts: productUpdates.length, updatedVariants: variantUpdates.length };
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

/** Toman is integer money — round every computed step, floor the result at 0. */
function applyPriceChange(
  price: number,
  mode: BulkUpdatePriceInput['mode'],
  direction: BulkUpdatePriceInput['direction'],
  value: number,
): number {
  const delta = mode === 'percent' ? Math.round((price * value) / 100) : Math.round(value);
  const next = direction === 'increase' ? price + delta : price - delta;
  return Math.max(0, next);
}

function toCardView(product: ProductListRow, media: Media[]): ProductCardView {
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    basePrice: product.basePrice,
    isAmazingDeal: product.isAmazingDeal,
    isFeatured: product.isFeatured,
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

function toDetail(
  product: ProductFullRow,
  media: Media[],
  documents: ProductDocument[],
  documentMedia: Media[],
): ProductDetail {
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    shortDesc: product.shortDesc,
    description: product.description,
    basePrice: product.basePrice,
    isAmazingDeal: product.isAmazingDeal,
    isFeatured: product.isFeatured,
    datasheetUrl: firstUrlOf(media, 'DATASHEET'),
    model3dUrl: firstUrlOf(media, 'MODEL_3D'),
    explodedViewUrl: firstUrlOf(media, 'EXPLODED_VIEW'),
    parts: toPartViews(product.parts),
    highlights: toHighlightViews(product),
    model3dHotspots: toModel3dHotspotViews(product),
    documents: toDocumentViews(documents, documentMedia),
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
