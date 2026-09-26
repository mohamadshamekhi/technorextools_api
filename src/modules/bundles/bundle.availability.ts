/**
 * Whether a pack can be bought, in one place. The storefront catalog view, the
 * cart line and `addBundle`'s guard all read it from here so the three can't
 * drift apart (the client used to re-derive it from `stockQty`).
 */
export interface BundleAvailabilityInput {
  isActive: boolean;
  items: Array<{
    qty: number;
    variant: {
      stockQty: number;
      isActive: boolean;
      product: { isActive: boolean; deletedAt: Date | null };
    };
  }>;
}

export interface BundleAvailability {
  /** How many whole packs the members' stock covers. */
  packagesInStock: number;
  /** Every member variant — and its product — is orderable. */
  membersActive: boolean;
  /** The pack is active, its members are orderable, and `qty` packs are in stock. */
  available: boolean;
}

export function bundleAvailability(bundle: BundleAvailabilityInput, qty = 1): BundleAvailability {
  if (bundle.items.length === 0) {
    return { packagesInStock: 0, membersActive: false, available: false };
  }
  const membersActive = bundle.items.every(
    (i) => i.variant.isActive && i.variant.product.isActive && i.variant.product.deletedAt === null,
  );
  const packagesInStock = Math.min(
    ...bundle.items.map((i) => (i.qty > 0 ? Math.floor(i.variant.stockQty / i.qty) : 0)),
  );
  return {
    packagesInStock,
    membersActive,
    available: bundle.isActive && membersActive && packagesInStock >= qty,
  };
}
