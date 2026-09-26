import { bundleAvailability } from './bundle.availability';

const member = (
  over: Partial<{
    qty: number;
    stockQty: number;
    isActive: boolean;
    productActive: boolean;
    deletedAt: Date | null;
  }> = {},
) => ({
  qty: over.qty ?? 1,
  variant: {
    stockQty: over.stockQty ?? 10,
    isActive: over.isActive ?? true,
    product: { isActive: over.productActive ?? true, deletedAt: over.deletedAt ?? null },
  },
});

describe('bundleAvailability', () => {
  it('counts whole packs from the tightest member', () => {
    const r = bundleAvailability({
      isActive: true,
      items: [member({ qty: 1, stockQty: 10 }), member({ qty: 3, stockQty: 7 })],
    });
    expect(r).toEqual({ packagesInStock: 2, membersActive: true, available: true });
  });

  it('is unavailable when a member variant is inactive', () => {
    const r = bundleAvailability({ isActive: true, items: [member({ isActive: false })] });
    expect(r).toMatchObject({ membersActive: false, available: false });
  });

  it("is unavailable when a member's product is inactive", () => {
    const r = bundleAvailability({ isActive: true, items: [member({ productActive: false })] });
    expect(r).toMatchObject({ membersActive: false, available: false });
  });

  it("is unavailable when a member's product is soft-deleted", () => {
    const r = bundleAvailability({ isActive: true, items: [member({ deletedAt: new Date() })] });
    expect(r).toMatchObject({ membersActive: false, available: false });
  });

  it('is unavailable when the pack itself is inactive, but still reports stock', () => {
    const r = bundleAvailability({ isActive: false, items: [member({ stockQty: 5 })] });
    expect(r).toEqual({ packagesInStock: 5, membersActive: true, available: false });
  });

  it('honours the requested qty', () => {
    const input = { isActive: true, items: [member({ qty: 1, stockQty: 2 })] };
    expect(bundleAvailability(input, 2).available).toBe(true);
    expect(bundleAvailability(input, 3).available).toBe(false);
  });

  it('treats an empty pack as unavailable instead of Infinity', () => {
    expect(bundleAvailability({ isActive: true, items: [] })).toEqual({
      packagesInStock: 0,
      membersActive: false,
      available: false,
    });
  });

  it('treats a zero-qty member as out of stock', () => {
    expect(bundleAvailability({ isActive: true, items: [member({ qty: 0 })] })).toMatchObject({
      packagesInStock: 0,
      available: false,
    });
  });
});
