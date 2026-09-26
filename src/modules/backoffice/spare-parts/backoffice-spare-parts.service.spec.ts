import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BackofficeSparePartsService } from './backoffice-spare-parts.service';

const row = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  title: 'موتور',
  slug: 'motor',
  partNumber: null,
  shortDesc: null,
  description: null,
  price: 100,
  stockQty: 1,
  weightGrams: null,
  isActive: true,
  compatibleProducts: [],
  ...over,
});

function make(
  over: { spare?: Record<string, jest.Mock>; products?: Record<string, jest.Mock> } = {},
) {
  const spareParts = {
    findById: jest.fn().mockResolvedValue(row()),
    findAnyBySlug: jest.fn().mockResolvedValue(null),
    findAnyByPartNumber: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(row()),
    countByIds: jest.fn().mockResolvedValue(1),
    replaceForProduct: jest.fn().mockResolvedValue(undefined),
    findByProductId: jest.fn().mockResolvedValue([]),
    ...over.spare,
  };
  const products = {
    findById: jest.fn().mockResolvedValue({ id: 'p1', deletedAt: null }),
    countByIds: jest.fn().mockResolvedValue(1),
    ...over.products,
  };
  const media = { findByOwners: jest.fn().mockResolvedValue([]) };
  return {
    service: new BackofficeSparePartsService(
      spareParts as never,
      products as never,
      media as never,
    ),
    spareParts,
  };
}

describe('BackofficeSparePartsService', () => {
  it('creates with de-duplicated compatible products', async () => {
    const { service, spareParts } = make();
    await service.create({
      title: 'موتور',
      slug: 'motor',
      partNumber: null,
      shortDesc: null,
      description: null,
      price: 100,
      stockQty: 1,
      weightGrams: null,
      isActive: true,
      productIds: ['p1', 'p1'],
    });
    expect(spareParts.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ productIds: expect.anything() }),
      ['p1'],
    );
  });

  it('409s on a duplicate slug', async () => {
    const { service } = make({ spare: { findAnyBySlug: jest.fn().mockResolvedValue(row()) } });
    await expect(
      service.create({
        title: 'x',
        slug: 'motor',
        partNumber: null,
        shortDesc: null,
        description: null,
        price: 1,
        stockQty: 0,
        weightGrams: null,
        isActive: true,
        productIds: [],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('400s when a compatible product does not exist', async () => {
    const { service } = make({ products: { countByIds: jest.fn().mockResolvedValue(0) } });
    await expect(
      service.create({
        title: 'x',
        slug: 'y',
        partNumber: null,
        shortDesc: null,
        description: null,
        price: 1,
        stockQty: 0,
        weightGrams: null,
        isActive: true,
        productIds: ['p9'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('product side: replaces the set, 404 on unknown product, 400 on unknown part', async () => {
    const { service, spareParts } = make();
    await service.replaceForProduct('p1', ['s1', 's1']);
    expect(spareParts.replaceForProduct).toHaveBeenCalledWith('p1', ['s1']);

    const missing = make({ products: { findById: jest.fn().mockResolvedValue(null) } });
    await expect(missing.service.replaceForProduct('p1', [])).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const bad = make({ spare: { countByIds: jest.fn().mockResolvedValue(0) } });
    await expect(bad.service.replaceForProduct('p1', ['s1'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
