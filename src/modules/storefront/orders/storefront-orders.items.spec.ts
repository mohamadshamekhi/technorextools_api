import { StorefrontOrdersService } from './storefront-orders.service';
import type { OrderDetailRow, OrderRepository } from '../../orders/repositories/order.repository';
import type { UserRepository } from '../../access/repositories/user.repository';
import type { MediaRepository } from '../../media/repositories/media.repository';

const img = (ownerId: string, url: string, isMain = true) => ({
  id: `m-${ownerId}`,
  ownerId,
  url,
  purpose: 'GALLERY',
  isMain,
  sortOrder: 0,
  alt: null,
  ownerType: null,
});

const order = {
  id: 'o1',
  orderNumber: 'AB-1',
  userId: 'u1',
  status: 'paid',
  total: 100,
  subtotal: 100,
  discountAmount: 0,
  shippingCost: 0,
  paymentMethod: 'online',
  placedAt: new Date('2026-01-01T00:00:00Z'),
  carrier: null,
  trackingNumber: null,
  address: {
    receiverName: 'علی',
    receiverMobile: '09120000000',
    province: 'تهران',
    city: 'تهران',
    fullAddress: 'خیابان ولیعصر',
    postalCode: '1234567890',
  },
  shippingMethod: null,
  discount: null,
  payments: [],
  statusHistory: [],
  items: [
    {
      productTitle: 'دریل بوش',
      sku: 'BSD-1',
      qty: 2,
      unitPrice: 50,
      variant: { id: 'v1', product: { id: 'p1', slug: 'bosch-drill' } },
      bundle: null,
      sparePart: null,
    },
    {
      productTitle: 'پک تخفیف',
      sku: null,
      qty: 1,
      unitPrice: 50,
      variant: null,
      bundle: { id: 'b1', slug: 'starter-pack' },
      sparePart: null,
    },
    {
      productTitle: 'فک متحرک',
      sku: 'SP-9',
      qty: 1,
      unitPrice: 50,
      variant: null,
      bundle: null,
      sparePart: { id: 's1', slug: 'moving-jaw' },
    },
  ],
} as unknown as OrderDetailRow;

function build(mediaByType: Record<string, unknown[]> = {}) {
  const orders = {
    findByNumber: jest.fn().mockResolvedValue(order),
  } as unknown as OrderRepository;
  const users = { findById: jest.fn() } as unknown as UserRepository;
  const findByOwners = jest.fn((ownerType: string) =>
    Promise.resolve(mediaByType[ownerType] ?? []),
  );
  const media = { findByOwners } as unknown as MediaRepository;
  return { svc: new StorefrontOrdersService(orders, users, media), findByOwners };
}

describe('StorefrontOrdersService.detail — item image and link', () => {
  it("prefers the variant's own image over the product's", async () => {
    const { svc } = build({
      PRODUCT_VARIANT: [img('v1', 'https://cdn/variant.webp')],
      PRODUCT: [img('p1', 'https://cdn/product.webp')],
    });
    const view = await svc.detail('u1', 'AB-1');
    expect(view.items[0]).toMatchObject({
      kind: 'variant',
      productSlug: 'bosch-drill',
      imageUrl: 'https://cdn/variant.webp',
      lineTotal: 100,
    });
  });

  it("falls back to the product's image when the variant has none", async () => {
    const { svc } = build({ PRODUCT: [img('p1', 'https://cdn/product.webp')] });
    const view = await svc.detail('u1', 'AB-1');
    expect(view.items[0]?.imageUrl).toBe('https://cdn/product.webp');
  });

  it('maps a spare-part line to its own slug and image', async () => {
    const { svc } = build({ SPARE_PART: [img('s1', 'https://cdn/part.webp')] });
    const view = await svc.detail('u1', 'AB-1');
    expect(view.items[2]).toMatchObject({
      kind: 'spare_part',
      productSlug: 'moving-jaw',
      imageUrl: 'https://cdn/part.webp',
    });
  });

  it('gives a bundle line its slug and a null image', async () => {
    const { svc } = build();
    const view = await svc.detail('u1', 'AB-1');
    expect(view.items[1]).toMatchObject({
      kind: 'bundle',
      productSlug: 'starter-pack',
      imageUrl: null,
    });
  });

  it('queries media once per owner type, not once per line', async () => {
    const { svc, findByOwners } = build();
    await svc.detail('u1', 'AB-1');
    expect(findByOwners).toHaveBeenCalledTimes(3);
    expect(findByOwners).toHaveBeenCalledWith('PRODUCT_VARIANT', ['v1']);
    expect(findByOwners).toHaveBeenCalledWith('PRODUCT', ['p1']);
    expect(findByOwners).toHaveBeenCalledWith('SPARE_PART', ['s1']);
  });

  it('keeps the existing fields untouched', async () => {
    const { svc } = build();
    const view = await svc.detail('u1', 'AB-1');
    expect(view.items[0]).toMatchObject({
      productTitle: 'دریل بوش',
      sku: 'BSD-1',
      qty: 2,
      unitPrice: 50,
      lineTotal: 100,
    });
  });
});
