import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Category } from '@prisma/client';
import { StorefrontCatalogService } from './storefront-catalog.service';
import type { BrandRepository } from '../../catalog/repositories/brand.repository';
import type { CategoryRepository } from '../../catalog/repositories/category.repository';
import type { ProductRepository } from '../../catalog/repositories/product.repository';
import type { CommentRepository } from '../../catalog/repositories/comment.repository';
import type { BundleRepository } from '../../bundles/repositories/bundle.repository';
import type { MediaRepository } from '../../media/repositories/media.repository';
import type { ProductDocumentRepository } from '../../catalog/repositories/product-document.repository';
import type { ProductQuestionRepository } from '../../catalog/repositories/product-question.repository';
import type { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';

const cat = (id: string, parentId: string | null, slug = id): Category => ({
  id,
  parentId,
  title: `دسته ${id}`,
  slug,
  imageUrl: null,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

function make(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const categories = {
    findBySlug: overrides.categoryFindBySlug ?? jest.fn().mockResolvedValue(null),
    findMany: overrides.categoryFindMany ?? jest.fn().mockResolvedValue([]),
  } as unknown as CategoryRepository;
  const brands = {
    findBySlug: overrides.brandFindBySlug ?? jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  } as unknown as BrandRepository;
  const paginate = overrides.paginate ?? jest.fn().mockResolvedValue({ items: [], total: 0 });
  const products = {
    findBySlugForStorefront: overrides.findBySlugForStorefront ?? jest.fn().mockResolvedValue(null),
    paginate,
  } as unknown as ProductRepository;
  const comments = {
    paginateApprovedByProduct:
      overrides.paginateApprovedByProduct ?? jest.fn().mockResolvedValue([[], 0]),
  } as unknown as CommentRepository;
  const bundles = {
    findMany: overrides.bundleFindMany ?? jest.fn().mockResolvedValue([]),
    findBySlug: overrides.bundleFindBySlug ?? jest.fn().mockResolvedValue(null),
  } as unknown as BundleRepository;
  const media = {
    findByOwners: overrides.mediaFindByOwners ?? jest.fn().mockResolvedValue([]),
    findProductMedia: overrides.mediaFindProductMedia ?? jest.fn().mockResolvedValue([]),
    findByIds: jest.fn().mockResolvedValue([]),
  } as unknown as MediaRepository;
  const documents = {
    findByProduct: jest.fn().mockResolvedValue([]),
  } as unknown as ProductDocumentRepository;
  const questions = {
    findApprovedByProduct: jest.fn().mockResolvedValue([]),
  } as unknown as ProductQuestionRepository;
  const variants = {
    findActiveByProductIds: jest.fn().mockResolvedValue([]),
  } as unknown as ProductVariantRepository;
  return {
    service: new StorefrontCatalogService(
      categories,
      brands,
      products,
      comments,
      bundles,
      media,
      documents,
      questions,
      variants,
    ),
    products,
    paginate,
  };
}

const baseQuery = {
  skip: 0,
  take: 20,
  sort: 'newest' as const,
};

describe('StorefrontCatalogService', () => {
  it('rejects an unknown category slug', async () => {
    const { service } = make();
    await expect(service.listProducts({ ...baseQuery, category: 'nope' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unknown brand slug', async () => {
    const { service } = make();
    await expect(service.listProducts({ ...baseQuery, brand: 'nope' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('expands a category filter to all descendant categories', async () => {
    const { service, paginate } = make({
      categoryFindBySlug: jest.fn().mockResolvedValue(cat('root', null, 'pneumatic')),
      categoryFindMany: jest
        .fn()
        .mockResolvedValue([
          cat('root', null, 'pneumatic'),
          cat('child', 'root'),
          cat('grandchild', 'child'),
          cat('unrelated', null),
        ]),
    });
    await service.listProducts({ ...baseQuery, category: 'pneumatic' });
    const where = paginate.mock.calls[0]![0] as { AND: Array<Record<string, unknown>> };
    expect(where.AND).toContainEqual({
      categoryId: { in: ['root', 'child', 'grandchild'] },
    });
  });

  it('always filters to active, non-deleted products', async () => {
    const { service, paginate } = make();
    await service.listProducts(baseQuery);
    const where = paginate.mock.calls[0]![0] as { AND: Array<Record<string, unknown>> };
    expect(where.AND).toContainEqual({ isActive: true });
    expect(where.AND).toContainEqual({ deletedAt: null });
  });

  it('sorts by price ascending when requested', async () => {
    const { service, paginate } = make();
    await service.listProducts({ ...baseQuery, sort: 'price-asc' });
    expect(paginate.mock.calls[0]![3]).toEqual({ basePrice: 'asc' });
  });

  it('throws not-found for a missing product slug', async () => {
    const { service } = make();
    await expect(service.productDetail('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns effective variant prices and hides inactive related products', async () => {
    const scalars = {
      id: 'p1',
      title: 'بکس بادی',
      slug: 'air-wrench',
      shortDesc: null,
      description: null,
      basePrice: 1_000_000,
      isAmazingDeal: true,
      datasheetUrl: 'https://example.com/ds.pdf',
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const relatedCard = (id: string, active: boolean, deleted: boolean) => ({
      id,
      categoryId: 'c1',
      brandId: null,
      title: `مرتبط ${id}`,
      slug: `related-${id}`,
      shortDesc: null,
      description: null,
      basePrice: 500_000,
      isAmazingDeal: false,
      datasheetUrl: null,
      isActive: active,
      deletedAt: deleted ? new Date() : null,
      createdAt: new Date(),
      updatedAt: new Date(),
      brand: { id: 'b1', title: 'پوما', slug: 'puma' },
      images: [{ id: 'i2', url: 'https://example.com/2.jpg', isMain: true }],
    });
    const { service } = make({
      findBySlugForStorefront: jest.fn().mockResolvedValue({
        ...scalars,
        parts: [
          { number: 2, name: 'کلید', code: 'AW-P02', sellable: true, hotspot: { x: 10, y: 20 } },
          { number: 1, name: 'بدنه', code: 'AW-P01', sellable: false, hotspot: null },
        ],
        category: { id: 'c1', title: 'ابزار بادی', slug: 'pneumatic' },
        brand: {
          id: 'b1',
          title: 'پوما',
          slug: 'puma',
          logoUrl: null,
          isExclusiveDistributor: true,
          authenticityNote: 'نمایندگی انحصاری',
        },
        images: [
          {
            id: 'i1',
            url: 'https://example.com/1.jpg',
            variantId: null,
            isMain: true,
            sortOrder: 0,
          },
        ],
        variants: [
          {
            id: 'v1',
            productId: 'p1',
            sku: 'AW-RED',
            colorName: 'قرمز',
            stockQty: 3,
            priceOverride: 1_200_000,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'v2',
            productId: 'p1',
            sku: 'AW-BLUE',
            colorName: 'آبی',
            stockQty: 0,
            priceOverride: null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        attributeValues: [
          {
            id: 'av1',
            productId: 'p1',
            attributeId: 'a1',
            value: '۶۵۰',
            attribute: {
              id: 'a1',
              attributeGroupId: 'g1',
              title: 'گشتاور',
              unit: 'نیوتون‌متر',
              inputType: 'number',
              options: [],
              sortOrder: 0,
              createdAt: new Date(),
            },
          },
        ],
        relatedTo: [
          {
            id: 'r1',
            productId: 'p1',
            relatedProductId: 'p2',
            related: relatedCard('p2', true, false),
          },
          {
            id: 'r2',
            productId: 'p1',
            relatedProductId: 'p3',
            related: relatedCard('p3', false, false),
          },
          {
            id: 'r3',
            productId: 'p1',
            relatedProductId: 'p4',
            related: relatedCard('p4', true, true),
          },
        ],
      }),
    });
    const detail = await service.productDetail('air-wrench');
    expect(detail.parts).toEqual([
      { number: 1, name: 'بدنه', code: 'AW-P01', sellable: false, hotspot: null },
      { number: 2, name: 'کلید', code: 'AW-P02', sellable: true, hotspot: { x: 10, y: 20 } },
    ]);
    expect(detail.variants[0]!.effectivePrice).toBe(1_200_000);
    expect(detail.variants[1]!.effectivePrice).toBe(1_000_000);
    expect(detail.related).toHaveLength(1);
    expect(detail.related[0]!.slug).toBe('related-p2');
    expect(detail.brand?.isExclusiveDistributor).toBe(true);
  });

  it('derives datasheet / model3d / images from media rows', async () => {
    const { service } = make({
      findBySlugForStorefront: jest.fn().mockResolvedValue({
        id: 'p1',
        title: 't',
        slug: 'air-wrench',
        shortDesc: null,
        description: null,
        basePrice: 1,
        isAmazingDeal: false,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'c1', title: 'c', slug: 'c' },
        parts: [],
        brand: null,
        variants: [],
        attributeValues: [],
        relatedTo: [],
      }),
      mediaFindProductMedia: jest.fn().mockResolvedValue([
        {
          id: 'm1',
          url: 'https://x/g.jpg',
          alt: null,
          isMain: true,
          sortOrder: 0,
          purpose: 'GALLERY',
          ownerType: 'PRODUCT',
          ownerId: 'p1',
        },
        {
          id: 'm2',
          url: 'https://x/d.pdf',
          alt: null,
          isMain: false,
          sortOrder: 0,
          purpose: 'DATASHEET',
          ownerType: 'PRODUCT',
          ownerId: 'p1',
        },
        {
          id: 'm3',
          url: 'https://x/m.glb',
          alt: null,
          isMain: false,
          sortOrder: 0,
          purpose: 'MODEL_3D',
          ownerType: 'PRODUCT',
          ownerId: 'p1',
        },
      ]),
    });
    const detail = await service.productDetail('air-wrench');
    expect(detail.datasheetUrl).toBe('https://x/d.pdf');
    expect(detail.model3dUrl).toBe('https://x/m.glb');
    expect(detail.parts).toEqual([]);
    expect(detail.images).toEqual([
      { id: 'm1', url: 'https://x/g.jpg', alt: null, isMain: true, sortOrder: 0, variantId: null },
    ]);
  });
});
