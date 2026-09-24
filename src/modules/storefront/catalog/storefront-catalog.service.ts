import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Category, Media, Prisma, Product, ProductVariant } from '@prisma/client';
import { ProductRepository } from '../../catalog/repositories/product.repository';
import { CategoryRepository } from '../../catalog/repositories/category.repository';
import { BrandRepository } from '../../catalog/repositories/brand.repository';
import { CommentRepository } from '../../catalog/repositories/comment.repository';
import {
  BundleRepository,
  type BundleDetailRow,
} from '../../bundles/repositories/bundle.repository';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { MediaRepository } from '../../media/repositories/media.repository';
import { ProductDocumentRepository } from '../../catalog/repositories/product-document.repository';
import { ProductQuestionRepository } from '../../catalog/repositories/product-question.repository';
import {
  toDocumentViews,
  toHighlightViews,
  toModel3dHotspotViews,
  toQuestionViews,
  type ProductDocumentView,
  type ProductHighlightView,
  type ProductModel3dHotspotView,
  type ProductQuestionView,
} from '../../catalog/product-extras.view';
import { firstUrlOf, mainImageUrlOf, toGalleryImages } from '../../media/media.gallery';
import { toPartViews, type ProductPartView } from '../../catalog/product-parts.view';
import type {
  StorefrontCreateCommentInput,
  StorefrontListCommentsQuery,
  StorefrontListProductsQuery,
} from './storefront-catalog.schemas';

export interface StorefrontCategoryNode {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  children: StorefrontCategoryNode[];
}

export interface StorefrontBrandView {
  id: string;
  title: string;
  slug: string;
  logoUrl: string | null;
  isExclusiveDistributor: boolean;
}

export interface StorefrontProductCardView {
  id: string;
  title: string;
  slug: string;
  basePrice: number;
  isAmazingDeal: boolean;
  isFeatured: boolean;
  brand: { title: string; slug: string } | null;
  mainImageUrl: string | null;
  /** First active variant — the price/id a card must show and add to cart. */
  firstVariant: { id: string; effectivePrice: number; stockQty: number } | null;
}

export interface StorefrontProductDetailView {
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
  questions: ProductQuestionView[];
  category: { id: string; title: string; slug: string };
  brand: {
    id: string;
    title: string;
    slug: string;
    logoUrl: string | null;
    isExclusiveDistributor: boolean;
    authenticityNote: string | null;
  } | null;
  images: Array<{
    id: string;
    url: string;
    alt: string | null;
    variantId: string | null;
    isMain: boolean;
    sortOrder: number;
  }>;
  variants: Array<{
    id: string;
    sku: string;
    colorName: string | null;
    stockQty: number;
    effectivePrice: number;
  }>;
  attributeValues: Array<{
    attributeTitle: string;
    unit: string | null;
    inputType: string;
    value: string;
  }>;
  related: StorefrontProductCardView[];
}

export interface StorefrontCommentView {
  id: string;
  authorName: string | null;
  rating: number;
  body: string;
  createdAt: Date;
}

export interface StorefrontBundleItemView {
  qty: number;
  variant: {
    id: string;
    sku: string;
    colorName: string | null;
    stockQty: number;
    effectivePrice: number;
    imageUrl: string | null;
    product: { id: string; title: string; slug: string };
  };
}

export interface StorefrontBundleView {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  bundlePrice: number;
  items: StorefrontBundleItemView[];
}

@Injectable()
export class StorefrontCatalogService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly brands: BrandRepository,
    private readonly products: ProductRepository,
    private readonly comments: CommentRepository,
    private readonly bundles: BundleRepository,
    private readonly media: MediaRepository,
    private readonly documents: ProductDocumentRepository,
    private readonly questions: ProductQuestionRepository,
    private readonly variants: ProductVariantRepository,
  ) {}

  /** First active variant per product id. */
  private async firstVariantByProduct(ids: string[]): Promise<Map<string, ProductVariant>> {
    const rows = await this.variants.findActiveByProductIds(ids);
    const map = new Map<string, ProductVariant>();
    for (const row of rows) {
      if (!map.has(row.productId)) map.set(row.productId, row);
    }
    return map;
  }

  /** Media rows for a set of products, grouped by product id. */
  private async mediaByProduct(ids: string[]): Promise<Map<string, Media[]>> {
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

  async productComments(
    slug: string,
    query: StorefrontListCommentsQuery,
  ): Promise<{
    items: StorefrontCommentView[];
    total: number;
    skip: number;
    take: number;
    averageRating: number | null;
  }> {
    const product = await this.products.findBySlug(slug);
    if (!product || !product.isActive || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد');
    }
    const [rows, total] = await this.comments.paginateApprovedByProduct(
      product.id,
      query.skip,
      query.take,
    );
    const avg =
      total > 0 && rows.length > 0
        ? rows.reduce((sum, c) => sum + c.rating, 0) / rows.length
        : null;
    return {
      items: rows.map((c) => ({
        id: c.id,
        authorName: c.user.fullName,
        rating: c.rating,
        body: c.body,
        createdAt: c.createdAt,
      })),
      total,
      skip: query.skip,
      take: query.take,
      averageRating: avg === null ? null : Math.round(avg * 10) / 10,
    };
  }

  async addComment(
    userId: string,
    slug: string,
    input: StorefrontCreateCommentInput,
  ): Promise<{ status: 'pending' }> {
    const product = await this.products.findBySlug(slug);
    if (!product || !product.isActive || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد');
    }
    const existing = await this.comments.findByUserAndProduct(userId, product.id);
    if (existing) throw new BadRequestException('شما پیش‌تر برای این محصول نظر ثبت کرده‌اید');
    await this.comments.create({
      userId,
      productId: product.id,
      rating: input.rating,
      body: input.body,
    });
    return { status: 'pending' };
  }

  /** Public Q&A of a product — approved rows only. */
  async productQuestions(slug: string): Promise<ProductQuestionView[]> {
    const product = await this.activeProductOrThrow(slug);
    return toQuestionViews(await this.questions.findApprovedByProduct(product.id));
  }

  /** A signed-in customer asks a question; it stays `pending` until staff answers it. */
  async addQuestion(
    userId: string,
    slug: string,
    question: string,
  ): Promise<{ status: 'pending' }> {
    const product = await this.activeProductOrThrow(slug);
    await this.questions.create({ userId, productId: product.id, question });
    return { status: 'pending' };
  }

  private async activeProductOrThrow(slug: string) {
    const product = await this.products.findBySlug(slug);
    if (!product || !product.isActive || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد');
    }
    return product;
  }

  async listBundles(): Promise<StorefrontBundleView[]> {
    const rows = await this.bundles.findMany({ isActive: true });
    const media = await this.variantMedia(rows);
    return rows.map((b) => toBundleView(b, media));
  }

  async bundleDetail(slug: string): Promise<StorefrontBundleView> {
    const bundle = await this.bundles.findBySlug(slug);
    if (!bundle || !bundle.isActive) {
      throw new NotFoundException('پکیج یافت نشد');
    }
    return toBundleView(bundle, await this.variantMedia([bundle]));
  }

  /** Media rows for every variant referenced by the given bundles, grouped by variant id. */
  private async variantMedia(bundles: BundleDetailRow[]): Promise<Map<string, Media[]>> {
    const variantIds = [...new Set(bundles.flatMap((b) => b.items.map((i) => i.variant.id)))];
    const rows = await this.media.findByOwners('PRODUCT_VARIANT', variantIds);
    const map = new Map<string, Media[]>();
    for (const row of rows) {
      if (!row.ownerId) continue;
      const list = map.get(row.ownerId);
      if (list) list.push(row);
      else map.set(row.ownerId, [row]);
    }
    return map;
  }

  async categoryTree(): Promise<StorefrontCategoryNode[]> {
    const rows = await this.categories.findMany({ isActive: true });
    return buildTree(rows);
  }

  async listBrands(): Promise<StorefrontBrandView[]> {
    const rows = await this.brands.findMany();
    const logos = await this.brandLogos(rows.map((b) => b.id));
    return rows.map((brand) => ({
      id: brand.id,
      title: brand.title,
      slug: brand.slug,
      logoUrl: logos.get(brand.id) ?? null,
      isExclusiveDistributor: brand.isExclusiveDistributor,
    }));
  }

  /** Brand logos live in `media` (`ownerType: BRAND`, `purpose: LOGO`) — one query for many brands. */
  private async brandLogos(brandIds: string[]): Promise<Map<string, string>> {
    const rows = await this.media.findByOwners('BRAND', brandIds);
    const map = new Map<string, string>();
    for (const m of rows) {
      if (m.purpose === 'LOGO' && m.ownerId && !map.has(m.ownerId)) map.set(m.ownerId, m.url);
    }
    return map;
  }

  async listProducts(
    query: StorefrontListProductsQuery,
  ): Promise<{ items: StorefrontProductCardView[]; total: number; skip: number; take: number }> {
    const and: Prisma.ProductWhereInput[] = [{ isActive: true }, { deletedAt: null }];

    if (query.category) {
      const category = await this.categories.findBySlug(query.category);
      if (!category) {
        throw new BadRequestException('دسته‌بندی یافت نشد');
      }
      const categoryIds = await this.collectDescendantIds(category);
      and.push({ categoryId: { in: categoryIds } });
    }

    if (query.brand) {
      const brand = await this.brands.findBySlug(query.brand);
      if (!brand) {
        throw new BadRequestException('برند یافت نشد');
      }
      and.push({ brandId: brand.id });
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      and.push({
        basePrice: {
          ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
          ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
        },
      });
    }

    if (query.isAmazingDeal !== undefined) {
      and.push({ isAmazingDeal: query.isAmazingDeal });
    }

    if (query.isFeatured !== undefined) {
      and.push({ isFeatured: query.isFeatured });
    }

    if (query.search) {
      and.push({ title: { contains: query.search } });
    }

    if (query.attrs) {
      for (const pair of query.attrs) {
        and.push({
          attributeValues: { some: { attributeId: pair.attributeId, value: pair.value } },
        });
      }
    }

    const orderBy =
      query.sort === 'price-asc'
        ? { basePrice: 'asc' as const }
        : query.sort === 'price-desc'
          ? { basePrice: 'desc' as const }
          : { createdAt: 'desc' as const };

    const { items, total } = await this.products.paginate(
      { AND: and },
      query.skip,
      query.take,
      orderBy,
    );
    const ids = items.map((p) => p.id);
    const media = await this.mediaByProduct(ids);
    const firstVariants = await this.firstVariantByProduct(ids);
    return {
      items: items.map((p) => toCardView(p, media.get(p.id) ?? [], firstVariants.get(p.id))),
      total,
      skip: query.skip,
      take: query.take,
    };
  }

  async productDetail(slug: string): Promise<StorefrontProductDetailView> {
    const product = await this.products.findBySlugForStorefront(slug);
    if (!product) {
      throw new NotFoundException('محصول یافت نشد');
    }
    const media = await this.media.findProductMedia(
      product.id,
      product.variants.map((v) => v.id),
    );
    const brandLogoUrl = product.brand
      ? ((await this.brandLogos([product.brand.id])).get(product.brand.id) ?? null)
      : null;
    const docs = await this.documents.findByProduct(product.id);
    const docMedia = await this.media.findByIds(docs.map((d) => d.mediaId));
    const questions = await this.questions.findApprovedByProduct(product.id);
    const relatedIds = product.relatedTo.map((rel) => rel.relatedProductId);
    const relatedMedia = await this.mediaByProduct(relatedIds);
    const relatedVariants = await this.firstVariantByProduct(relatedIds);
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
      documents: toDocumentViews(docs, docMedia),
      questions: toQuestionViews(questions),
      category: product.category,
      brand: product.brand
        ? {
            id: product.brand.id,
            title: product.brand.title,
            slug: product.brand.slug,
            logoUrl: brandLogoUrl,
            isExclusiveDistributor: product.brand.isExclusiveDistributor,
            authenticityNote: product.brand.authenticityNote,
          }
        : null,
      images: toGalleryImages(media),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        colorName: variant.colorName,
        stockQty: variant.stockQty,
        effectivePrice: variant.priceOverride ?? product.basePrice,
      })),
      attributeValues: product.attributeValues.map((v) => ({
        attributeTitle: v.attribute.title,
        unit: v.attribute.unit,
        inputType: v.attribute.inputType,
        value: v.value,
      })),
      related: product.relatedTo.flatMap((rel) =>
        rel.related &&
        rel.related.isActive &&
        rel.related.deletedAt === null &&
        rel.related.id !== product.id
          ? [
              toCardView(
                rel.related,
                relatedMedia.get(rel.related.id) ?? [],
                relatedVariants.get(rel.related.id),
              ),
            ]
          : [],
      ),
    };
  }

  /** Load all active categories once and walk the tree in memory. */
  private async collectDescendantIds(root: Category): Promise<string[]> {
    const all = await this.categories.findMany({ isActive: true });
    const childrenByParent = new Map<string, string[]>();
    for (const row of all) {
      if (!row.parentId) continue;
      const siblings = childrenByParent.get(row.parentId) ?? [];
      siblings.push(row.id);
      childrenByParent.set(row.parentId, siblings);
    }
    const ids = [root.id];
    const queue = [root.id];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const childId of childrenByParent.get(current) ?? []) {
        ids.push(childId);
        queue.push(childId);
      }
    }
    return ids;
  }
}

/** Anything with brand is enough for a card — list rows and related rows both qualify. */
type CardRow = Product & {
  brand: { id: string; title: string; slug: string } | null;
};

function toCardView(
  product: CardRow,
  media: Media[],
  variant: ProductVariant | undefined,
): StorefrontProductCardView {
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    basePrice: product.basePrice,
    isAmazingDeal: product.isAmazingDeal,
    isFeatured: product.isFeatured,
    brand: product.brand ? { title: product.brand.title, slug: product.brand.slug } : null,
    mainImageUrl: mainImageUrlOf(media),
    firstVariant: variant
      ? {
          id: variant.id,
          effectivePrice: variant.priceOverride ?? product.basePrice,
          stockQty: variant.stockQty,
        }
      : null,
  };
}

function toBundleView(
  bundle: BundleDetailRow,
  variantMedia: Map<string, Media[]>,
): StorefrontBundleView {
  return {
    id: bundle.id,
    title: bundle.title,
    slug: bundle.slug,
    description: bundle.description,
    bundlePrice: bundle.bundlePrice,
    items: bundle.items.map((item) => ({
      qty: item.qty,
      variant: {
        id: item.variant.id,
        sku: item.variant.sku,
        colorName: item.variant.colorName,
        stockQty: item.variant.stockQty,
        effectivePrice: item.variant.priceOverride ?? item.variant.product.basePrice,
        imageUrl: mainImageUrlOf(variantMedia.get(item.variant.id) ?? []),
        product: {
          id: item.variant.product.id,
          title: item.variant.product.title,
          slug: item.variant.product.slug,
        },
      },
    })),
  };
}

function buildTree(rows: Category[]): StorefrontCategoryNode[] {
  const byId = new Map<string, StorefrontCategoryNode>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      title: row.title,
      slug: row.slug,
      imageUrl: row.imageUrl,
      sortOrder: row.sortOrder,
      children: [],
    });
  }
  const roots: StorefrontCategoryNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent && node) {
      parent.children.push(node);
    } else if (node) {
      roots.push(node);
    }
  }
  return roots;
}
