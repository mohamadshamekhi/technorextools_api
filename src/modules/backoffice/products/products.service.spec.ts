import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { ProductsService } from './products.service';
import type { AttributeGroupRepository } from '../../catalog/repositories/attribute-group.repository';
import type { BrandRepository } from '../../catalog/repositories/brand.repository';
import type { CategoryRepository } from '../../catalog/repositories/category.repository';
import type { ProductRepository } from '../../catalog/repositories/product.repository';
import type { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import type { MediaRepository } from '../../media/repositories/media.repository';

const productRow = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  categoryId: 'c1',
  brandId: null,
  title: 'بکس بادی',
  slug: 'air-wrench',
  shortDesc: null,
  description: null,
  basePrice: 1_000_000,
  isAmazingDeal: false,
  isActive: true,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

function make(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const products = {
    findById: overrides.findById ?? jest.fn().mockResolvedValue(productRow()),
    findByIdFull: overrides.findByIdFull ?? jest.fn().mockResolvedValue(null),
    findBySlug: overrides.findBySlug ?? jest.fn().mockResolvedValue(null),
    create: overrides.create ?? jest.fn().mockResolvedValue(productRow()),
    update: overrides.update ?? jest.fn().mockResolvedValue(productRow()),
    softDelete: overrides.softDelete ?? jest.fn().mockResolvedValue(productRow()),
    countByBrandId: jest.fn().mockResolvedValue(0),
    countByIds: overrides.countByIds ?? jest.fn().mockResolvedValue(0),
    paginate: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    replaceAttributeValues: jest.fn().mockResolvedValue(undefined),
    replaceRelated: jest.fn().mockResolvedValue(undefined),
  } as unknown as ProductRepository;
  const variants = {
    findById: jest.fn().mockResolvedValue(null),
    findBySku: overrides.findBySku ?? jest.fn().mockResolvedValue(null),
    findManyByProductId: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  } as unknown as ProductVariantRepository;
  const categories = {
    findById: overrides.categoryFindById ?? jest.fn().mockResolvedValue({ id: 'c1' }),
  } as unknown as CategoryRepository;
  const brands = {
    findById: overrides.brandFindById ?? jest.fn().mockResolvedValue({ id: 'b1' }),
  } as unknown as BrandRepository;
  const attributeGroups = {
    findByCategoryId:
      overrides.attributeGroupsFindByCategory ??
      jest.fn().mockResolvedValue([
        {
          id: 'g1',
          categoryId: 'c1',
          title: 'مشخصات فنی',
          createdAt: new Date(),
          attributes: [{ id: 'a1', title: 'گشتاور', attributeGroupId: 'g1' }],
        },
      ]),
  } as unknown as AttributeGroupRepository;
  const media = {
    findByOwners: jest.fn().mockResolvedValue([]),
    findProductMedia: jest.fn().mockResolvedValue([]),
  } as unknown as MediaRepository;
  return {
    service: new ProductsService(products, variants, categories, brands, attributeGroups, media),
    products,
    variants,
  };
}

const createInput = {
  title: 'بکس بادی',
  slug: 'air-wrench',
  categoryId: 'c1',
  shortDesc: null,
  description: null,
  basePrice: 1_000_000,
  isAmazingDeal: false,
  isActive: true,
};

describe('ProductsService', () => {
  it('rejects a create with a duplicate slug', async () => {
    const { service } = make({ findBySlug: jest.fn().mockResolvedValue(productRow()) });
    await expect(service.create(createInput)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a create with an unknown category', async () => {
    const { service } = make({ categoryFindById: jest.fn().mockResolvedValue(null) });
    await expect(service.create(createInput)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a create with an unknown brand', async () => {
    const { service } = make({ brandFindById: jest.fn().mockResolvedValue(null) });
    await expect(service.create({ ...createInput, brandId: 'b1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('sends a Prisma-shaped create payload — relations connected, no scalar FK keys', async () => {
    const { service, products } = make();
    // getById after create throws (findByIdFull → null); we only care about the create call
    await service.create({ ...createInput, brandId: 'b1' }).catch(() => undefined);
    expect(products.create).toHaveBeenCalledTimes(1);
    const arg = (products.create as jest.Mock).mock.calls[0][0];
    expect(arg.category).toEqual({ connect: { id: 'c1' } });
    expect(arg.brand).toEqual({ connect: { id: 'b1' } });
    expect(arg).not.toHaveProperty('categoryId');
    expect(arg).not.toHaveProperty('brandId');
  });

  it('rejects a variant SKU that is already taken', async () => {
    const { service } = make({
      findBySku: jest.fn().mockResolvedValue({ id: 'v-other', sku: 'AW-RED' }),
    });
    await expect(
      service.createVariant('p1', {
        sku: 'AW-RED',
        colorName: 'قرمز',
        stockQty: 5,
        priceOverride: null,
        weightGrams: null,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an attribute value outside the category family', async () => {
    const { service } = make();
    await expect(
      service.replaceAttributeValues('p1', {
        values: [{ attributeId: 'a-other', value: '۶۵۰' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate attribute value in one payload', async () => {
    const { service } = make();
    await expect(
      service.replaceAttributeValues('p1', {
        values: [
          { attributeId: 'a1', value: '۶۵۰' },
          { attributeId: 'a1', value: '۷۰۰' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a product referencing itself as related', async () => {
    const { service } = make();
    await expect(
      service.replaceRelated('p1', { relatedProductIds: ['p1'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a related list containing a missing product', async () => {
    const { service } = make({ countByIds: jest.fn().mockResolvedValue(1) });
    await expect(
      service.replaceRelated('p1', { relatedProductIds: ['p1-other', 'p2-other'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soft-deletes instead of hard-deleting', async () => {
    const { service, products } = make();
    await service.delete('p1');
    expect(products.softDelete).toHaveBeenCalledWith('p1');
  });

  it('throws not-found when updating a missing product', async () => {
    const { service } = make({ findById: jest.fn().mockResolvedValue(null) });
    await expect(service.update('p1', { title: 'جدید' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
