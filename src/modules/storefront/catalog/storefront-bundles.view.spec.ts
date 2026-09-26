import { StorefrontCatalogService } from './storefront-catalog.service';
import type { BundleRepository } from '../../bundles/repositories/bundle.repository';
import type { MediaRepository } from '../../media/repositories/media.repository';

const img = (ownerId: string, url: string) => ({
  id: `m-${ownerId}`,
  ownerId,
  url,
  purpose: 'GALLERY',
  isMain: true,
  sortOrder: 0,
  alt: null,
  ownerType: null,
});

const bundle = {
  id: 'bn1',
  title: 'پک دریل + مته',
  slug: 'drill-pack',
  description: null,
  bundlePrice: 900_000,
  isActive: true,
  items: [
    {
      qty: 1,
      variant: {
        id: 'v1',
        sku: 'D-1',
        colorName: null,
        stockQty: 5,
        priceOverride: null,
        isActive: true,
        product: {
          id: 'p1',
          title: 'دریل',
          slug: 'drill',
          basePrice: 700_000,
          isActive: true,
          deletedAt: null,
        },
      },
    },
    {
      qty: 2,
      variant: {
        id: 'v2',
        sku: 'B-1',
        colorName: null,
        stockQty: 9,
        priceOverride: 150_000,
        isActive: true,
        product: {
          id: 'p2',
          title: 'مته',
          slug: 'bit',
          basePrice: 200_000,
          isActive: true,
          deletedAt: null,
        },
      },
    },
  ],
};

function build(mediaByType: Record<string, unknown[]> = {}) {
  const bundles = {
    findMany: jest.fn().mockResolvedValue([bundle]),
    findBySlug: jest.fn().mockResolvedValue(bundle),
  } as unknown as BundleRepository;
  const findByOwners = jest.fn((t: string) => Promise.resolve(mediaByType[t] ?? []));
  const media = { findByOwners } as unknown as MediaRepository;
  const svc = new StorefrontCatalogService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    bundles,
    media,
    {} as never,
    {} as never,
    {} as never,
  );
  return { svc, findByOwners };
}

function buildWith(items: unknown[]) {
  const bundles = {
    findMany: jest.fn().mockResolvedValue([{ ...bundle, items }]),
  } as unknown as BundleRepository;
  const media = { findByOwners: jest.fn().mockResolvedValue([]) } as unknown as MediaRepository;
  const svc = new StorefrontCatalogService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    bundles,
    media,
    {} as never,
    {} as never,
    {} as never,
  );
  return { svc };
}

describe('StorefrontCatalogService.listBundles', () => {
  it("uses the pack's own cover image when one is uploaded", async () => {
    const { svc } = build({
      BUNDLE: [img('bn1', 'https://cdn/pack.webp')],
      PRODUCT: [img('p1', 'https://cdn/drill.webp')],
    });
    const [view] = await svc.listBundles();
    expect(view?.imageUrl).toBe('https://cdn/pack.webp');
  });

  it("falls back to the first member's image when the pack has no cover", async () => {
    const { svc } = build({ PRODUCT: [img('p1', 'https://cdn/drill.webp')] });
    const [view] = await svc.listBundles();
    expect(view?.imageUrl).toBe('https://cdn/drill.webp');
  });

  it("resolves a member's image from its product when the variant has none", async () => {
    const { svc } = build({ PRODUCT: [img('p2', 'https://cdn/bit.webp')] });
    const [view] = await svc.listBundles();
    expect(view?.items[1]?.variant.imageUrl).toBe('https://cdn/bit.webp');
  });

  it("prefers a variant's own image over its product's", async () => {
    const { svc } = build({
      PRODUCT_VARIANT: [img('v1', 'https://cdn/variant.webp')],
      PRODUCT: [img('p1', 'https://cdn/drill.webp')],
    });
    const [view] = await svc.listBundles();
    expect(view?.items[0]?.variant.imageUrl).toBe('https://cdn/variant.webp');
  });

  it('computes compareAtTotal and savingAmount from the members', async () => {
    const { svc } = build();
    const [view] = await svc.listBundles();
    // 700_000×1 + 150_000×2 (priceOverride wins over basePrice)
    expect(view?.compareAtTotal).toBe(1_000_000);
    expect(view?.savingAmount).toBe(100_000);
  });

  it('never reports a negative saving', async () => {
    const { svc } = build();
    const [view] = await svc.listBundles();
    expect(view?.savingAmount).toBeGreaterThanOrEqual(0);
  });

  it('batches media into one query per owner type', async () => {
    const { svc, findByOwners } = build();
    await svc.listBundles();
    expect(findByOwners).toHaveBeenCalledTimes(3);
    expect(findByOwners).toHaveBeenCalledWith('BUNDLE', ['bn1']);
    expect(findByOwners).toHaveBeenCalledWith('PRODUCT_VARIANT', ['v1', 'v2']);
    expect(findByOwners).toHaveBeenCalledWith('PRODUCT', ['p1', 'p2']);
  });

  it('exposes isActive on the member variant and its product', async () => {
    const { svc } = build();
    const [view] = await svc.listBundles();
    expect(view?.items[0]?.variant).toMatchObject({
      isActive: true,
      product: { isActive: true },
    });
  });

  it('reports a soft-deleted product as inactive', async () => {
    const bundles = {
      findMany: jest.fn().mockResolvedValue([
        {
          ...bundle,
          items: [
            {
              qty: 1,
              variant: {
                ...bundle.items[0]!.variant,
                isActive: false,
                product: { ...bundle.items[0]!.variant.product, deletedAt: new Date() },
              },
            },
          ],
        },
      ]),
    } as unknown as BundleRepository;
    const media = {
      findByOwners: jest.fn().mockResolvedValue([]),
    } as unknown as MediaRepository;
    const svc = new StorefrontCatalogService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      bundles,
      media,
      {} as never,
      {} as never,
      {} as never,
    );
    const [view] = await svc.listBundles();
    expect(view?.items[0]?.variant).toMatchObject({
      isActive: false,
      product: { isActive: false },
    });
  });
});

describe('StorefrontCatalogService.listBundles — availability', () => {
  it('reports packagesInStock from the tightest member and available=true', async () => {
    const { svc } = build();
    const [view] = await svc.listBundles();
    // v1: floor(5/1)=5, v2: floor(9/2)=4 → 4
    expect(view).toMatchObject({ packagesInStock: 4, available: true });
  });

  it('is unavailable when a member variant is inactive', async () => {
    const { svc } = buildWith([
      { ...bundle.items[0]!, variant: { ...bundle.items[0]!.variant, isActive: false } },
    ]);
    const [view] = await svc.listBundles();
    expect(view).toMatchObject({ available: false });
  });

  it('is unavailable when no whole pack is in stock', async () => {
    const { svc } = buildWith([{ qty: 4, variant: { ...bundle.items[0]!.variant, stockQty: 3 } }]);
    const [view] = await svc.listBundles();
    expect(view).toMatchObject({ packagesInStock: 0, available: false });
  });
});
