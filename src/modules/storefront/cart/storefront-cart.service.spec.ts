import { ConflictException, NotFoundException } from '@nestjs/common';
import { StorefrontCartService } from './storefront-cart.service';
import type { CartRepository } from '../../cart/repositories/cart.repository';
import type { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import type { BundleRepository } from '../../bundles/repositories/bundle.repository';
import type { SparePartRepository } from '../../spare-parts/repositories/spare-part.repository';
import type { MediaRepository } from '../../media/repositories/media.repository';
import type { AuthenticatedUser } from '../../auth/token.types';

const USER: AuthenticatedUser = {
  id: 'user1',
  mobile: '+989120000000',
  roleId: 'r1',
  roleSlug: 'customer',
  isSuperadmin: false,
  permissions: [],
};

const variant = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 'v1',
    sku: 'SKU-1',
    colorName: 'قرمز',
    stockQty: 5,
    priceOverride: null,
    isActive: true,
    priceTiers: [],
    product: {
      id: 'p1',
      title: 'دریل',
      slug: 'drill',
      basePrice: 1000,
      isActive: true,
      deletedAt: null,
      images: [{ url: 'http://img/1.jpg' }],
    },
    ...over,
  }) as never;

const cartRow = (items: unknown[] = [], over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 'c1',
    userId: null,
    sessionToken: 'tok_abcdefgh',
    status: 'active',
    items,
    ...over,
  }) as never;

const line = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'i1',
  variantId: 'v1',
  qty: 2,
  variant: variant(),
  ...over,
});

function make(over: Record<string, jest.Mock> = {}) {
  const carts = {
    findActiveByUserId: over.findActiveByUserId ?? jest.fn().mockResolvedValue(null),
    findActiveByToken: over.findActiveByToken ?? jest.fn().mockResolvedValue(null),
    findActiveById: over.findActiveById ?? jest.fn().mockResolvedValue(null),
    create: over.create ?? jest.fn().mockResolvedValue(cartRow()),
    attachToUser: jest.fn().mockResolvedValue(undefined),
    setStatus: jest.fn().mockResolvedValue(undefined),
    findItem: over.findItem ?? jest.fn().mockResolvedValue(null),
    findItemByVariant: over.findItemByVariant ?? jest.fn().mockResolvedValue(null),
    addItem: over.addItem ?? jest.fn().mockResolvedValue(undefined),
    findItemBySparePart: jest.fn().mockResolvedValue(null),
    addSparePartItem: jest.fn().mockResolvedValue(undefined),
    setItemQty: over.setItemQty ?? jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    clearItems: jest.fn().mockResolvedValue(undefined),
    touch: jest.fn().mockResolvedValue(undefined),
  } as unknown as CartRepository;
  const variants = {
    findByIdForCart: over.findByIdForCart ?? jest.fn().mockResolvedValue(variant()),
  } as unknown as ProductVariantRepository;
  const bundles = {
    findById: over.bundleFindById ?? jest.fn().mockResolvedValue(null),
    findItemByBundle: jest.fn().mockResolvedValue(null),
  } as unknown as BundleRepository;
  const spareParts = {
    findById: over.sparePartFindById ?? jest.fn().mockResolvedValue(null),
  } as unknown as SparePartRepository;
  const media = {
    findByOwners: jest.fn().mockResolvedValue([]),
  } as unknown as MediaRepository;
  return {
    service: new StorefrontCartService(carts, variants, bundles, spareParts, media),
    carts,
    variants,
  };
}

describe('StorefrontCartService', () => {
  it('returns an empty shell when a guest has no cart', async () => {
    const { service } = make();
    const view = await service.getCart({ token: undefined });
    expect(view).toEqual({ token: '', items: [], itemCount: 0, subtotal: 0, fulfillable: true });
  });

  it('creates a cart and adds an item for a signed-in user', async () => {
    const { service, carts } = make({
      findActiveById: jest.fn().mockResolvedValue(cartRow([line({ qty: 2 })])),
    });
    const view = await service.addItem({ user: USER }, 'v1', 2);
    expect(carts.create).toHaveBeenCalled();
    expect(carts.addItem).toHaveBeenCalledWith('c1', 'v1', 2);
    expect(view.subtotal).toBe(2000);
    expect(view.itemCount).toBe(2);
  });

  it('caps quantity at available stock', async () => {
    const { service, carts } = make({
      findByIdForCart: jest.fn().mockResolvedValue(variant({ stockQty: 3 })),
      findActiveByUserId: jest.fn().mockResolvedValue(cartRow()),
      findActiveById: jest.fn().mockResolvedValue(cartRow([line({ qty: 3 })])),
    });
    await service.addItem({ user: USER }, 'v1', 10);
    expect(carts.addItem).toHaveBeenCalledWith('c1', 'v1', 3);
  });

  it('adds a spare part line, capped at its stock', async () => {
    const part = {
      id: 's1',
      title: 'موتور',
      slug: 'motor',
      partNumber: 'P-1',
      price: 500,
      stockQty: 2,
      isActive: true,
      deletedAt: null,
    };
    const { service, carts } = make({
      sparePartFindById: jest.fn().mockResolvedValue(part),
      findActiveByUserId: jest.fn().mockResolvedValue(cartRow()),
      findActiveById: jest
        .fn()
        .mockResolvedValue(
          cartRow([
            {
              id: 'i9',
              variantId: null,
              bundleId: null,
              sparePartId: 's1',
              qty: 2,
              sparePart: part,
            },
          ]),
        ),
    });
    const view = await service.addSparePart({ user: USER }, 's1', 10);
    expect(carts.addSparePartItem).toHaveBeenCalledWith('c1', 's1', 2);
    expect(view.items[0]).toMatchObject({ kind: 'spare_part', sparePartId: 's1', lineTotal: 1000 });
  });

  it('rejects an inactive spare part', async () => {
    const { service } = make({
      sparePartFindById: jest.fn().mockResolvedValue({ id: 's1', isActive: false, stockQty: 5 }),
    });
    await expect(service.addSparePart({ user: USER }, 's1', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('applies a bulk price tier', async () => {
    const v = variant({ priceTiers: [{ minQty: 3, unitPrice: 800 }] });
    const { service } = make({
      findByIdForCart: jest.fn().mockResolvedValue(v),
      findActiveByUserId: jest.fn().mockResolvedValue(cartRow()),
      findActiveById: jest.fn().mockResolvedValue(cartRow([line({ qty: 4, variant: v })])),
    });
    const view = await service.addItem({ user: USER }, 'v1', 4);
    expect(view.items[0]?.unitPrice).toBe(800);
    expect(view.subtotal).toBe(3200);
  });

  it('rejects an out-of-stock variant', async () => {
    const { service } = make({
      findByIdForCart: jest.fn().mockResolvedValue(variant({ stockQty: 0 })),
    });
    await expect(service.addItem({ user: USER }, 'v1', 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects an unknown variant', async () => {
    const { service } = make({ findByIdForCart: jest.fn().mockResolvedValue(null) });
    await expect(service.addItem({ user: USER }, 'v1', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('merges a guest cart into a fresh user by re-owning it', async () => {
    const guest = cartRow([line()], { id: 'guest1', userId: null });
    const { service, carts } = make({
      findActiveByToken: jest.fn().mockResolvedValue(guest),
      findActiveByUserId: jest.fn().mockResolvedValue(null),
    });
    await service.mergeGuestCartIntoUser('user1', 'tok_abcdefgh');
    expect(carts.attachToUser).toHaveBeenCalledWith('guest1', 'user1');
  });

  it('merges guest lines into an existing user cart and marks the guest merged', async () => {
    const guest = cartRow([line({ id: 'g-i1', qty: 2 })], { id: 'guest1', userId: null });
    const userCart = cartRow([], { id: 'uc1', userId: 'user1' });
    const { service, carts } = make({
      findActiveByToken: jest.fn().mockResolvedValue(guest),
      findActiveByUserId: jest.fn().mockResolvedValue(userCart),
    });
    await service.mergeGuestCartIntoUser('user1', 'tok_abcdefgh');
    expect(carts.addItem).toHaveBeenCalledWith('uc1', 'v1', 2);
    expect(carts.setStatus).toHaveBeenCalledWith('guest1', 'merged');
  });
});
