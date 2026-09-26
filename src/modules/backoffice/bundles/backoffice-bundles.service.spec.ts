import { BadRequestException } from '@nestjs/common';
import { BackofficeBundlesService } from './backoffice-bundles.service';
import type { BundleRepository } from '../../bundles/repositories/bundle.repository';
import type { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';

const member = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'v1',
  sku: 'SKU-1',
  stockQty: 10,
  isActive: true,
  product: { title: 'دریل بوش', isActive: true, deletedAt: null },
  ...over,
});

const savedRow = (items: Array<{ variantId: string; qty: number; stockQty?: number }>) => ({
  id: 'bn1',
  title: 'پک',
  slug: 'pack',
  description: null,
  bundlePrice: 900,
  isActive: true,
  items: items.map((i) => ({
    variantId: i.variantId,
    qty: i.qty,
    variant: {
      sku: 'SKU-1',
      stockQty: i.stockQty ?? 10,
      isActive: true,
      product: { title: 'دریل بوش', isActive: true, deletedAt: null },
    },
  })),
});

function make(variantRows: unknown[] = [member()]) {
  const bundles = {
    findBySlug: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(savedRow([{ variantId: 'v1', qty: 1 }])),
    findMany: jest.fn().mockResolvedValue([savedRow([{ variantId: 'v1', qty: 1 }])]),
    create: jest.fn((_data, items: Array<{ variantId: string; qty: number }>) =>
      Promise.resolve(savedRow(items.map((i) => ({ ...i, stockQty: 1 })))),
    ),
    update: jest.fn((_id, _data, items?: Array<{ variantId: string; qty: number }>) =>
      Promise.resolve(savedRow(items ?? [{ variantId: 'v1', qty: 1 }])),
    ),
  } as unknown as BundleRepository;
  const variants = {
    findManyByIdsWithStatus: jest.fn().mockResolvedValue(variantRows),
  } as unknown as ProductVariantRepository;
  return { svc: new BackofficeBundlesService(bundles, variants), bundles, variants };
}

const payload = (qty = 1) => ({
  title: 'پک',
  slug: 'pack',
  description: null,
  bundlePrice: 900,
  isActive: true,
  items: [{ variantId: 'v1', qty }],
});

describe('BackofficeBundlesService — member validation', () => {
  it('400s with BUNDLE_ITEM_INACTIVE naming the member when its variant is inactive', async () => {
    const { svc, bundles } = make([member({ isActive: false })]);
    await expect(svc.create(payload())).rejects.toMatchObject({
      status: 400,
      response: {
        message: '«دریل بوش» (کد SKU-1) غیرفعال یا حذف‌شده است و نمی‌تواند عضو پکیج باشد',
        details: { code: 'BUNDLE_ITEM_INACTIVE', variantId: 'v1', sku: 'SKU-1' },
      },
    });
    expect(bundles.create).not.toHaveBeenCalled();
  });

  it("400s when the member's product is soft-deleted", async () => {
    const { svc } = make([
      member({ product: { title: 'دریل بوش', isActive: true, deletedAt: new Date() } }),
    ]);
    await expect(svc.create(payload())).rejects.toMatchObject({
      response: { details: { code: 'BUNDLE_ITEM_INACTIVE' } },
    });
  });

  it('400s for an unknown variant id', async () => {
    const { svc } = make([]);
    await expect(svc.create(payload())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('saves but warns with BUNDLE_ITEM_OUT_OF_STOCK when stock is short', async () => {
    const { svc, bundles } = make([member({ stockQty: 2 })]);
    const view = await svc.create(payload(5));
    expect(bundles.create).toHaveBeenCalled();
    expect(view.warnings).toEqual([
      {
        code: 'BUNDLE_ITEM_OUT_OF_STOCK',
        variantId: 'v1',
        sku: 'SKU-1',
        stockQty: 2,
        requiredQty: 5,
      },
    ]);
  });

  it('returns no warnings when every member has enough stock', async () => {
    const { svc } = make([member({ stockQty: 20 })]);
    const view = await svc.create(payload(2));
    expect(view.warnings).toEqual([]);
  });

  it('validates members on update too and carries the warning through', async () => {
    const { svc } = make([member({ stockQty: 1 })]);
    const view = await svc.update('bn1', { items: [{ variantId: 'v1', qty: 3 }] });
    expect(view.warnings[0]).toMatchObject({ code: 'BUNDLE_ITEM_OUT_OF_STOCK', requiredQty: 3 });
  });

  it('skips member validation when update omits items', async () => {
    const { svc, variants } = make();
    const view = await svc.update('bn1', { title: 'نام تازه' });
    expect(variants.findManyByIdsWithStatus).not.toHaveBeenCalled();
    expect(view.warnings).toEqual([]);
  });

  it('looks members up in one batched query, not one per item', async () => {
    const { svc, variants } = make([member(), member({ id: 'v2', sku: 'SKU-2' })]);
    await svc.create({
      ...payload(),
      items: [
        { variantId: 'v1', qty: 1 },
        { variantId: 'v2', qty: 1 },
      ],
    });
    expect(variants.findManyByIdsWithStatus).toHaveBeenCalledTimes(1);
    expect(variants.findManyByIdsWithStatus).toHaveBeenCalledWith(['v1', 'v2']);
  });
});

describe('BackofficeBundlesService — publication status', () => {
  it('exposes available and packagesInStock on the list', async () => {
    const { svc } = make();
    const [view] = await svc.list();
    expect(view).toMatchObject({ available: true, packagesInStock: 10 });
    expect(view?.warnings).toEqual([]);
  });

  it('exposes them on the detail, with per-item stock and isActive', async () => {
    const { svc } = make();
    const view = await svc.getById('bn1');
    expect(view).toMatchObject({ available: true, packagesInStock: 10 });
    expect(view.items[0]).toMatchObject({ stockQty: 10, isActive: true, sku: 'SKU-1' });
  });

  it('reports available:false right after saving a pack whose member is short', async () => {
    const { svc } = make([member({ stockQty: 1 })]);
    const view = await svc.create(payload(1));
    // create() mock returns the saved row with stockQty 1 → floor(1/1) = 1 pack
    expect(view).toMatchObject({ available: true, packagesInStock: 1 });
  });
});
