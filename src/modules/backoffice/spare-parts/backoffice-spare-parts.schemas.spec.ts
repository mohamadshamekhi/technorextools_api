import {
  createSparePartSchema,
  replaceProductSparePartsSchema,
} from './backoffice-spare-parts.schemas';

const OID = 'a'.repeat(24);

describe('spare-part schemas', () => {
  it('accepts a valid payload and defaults productIds', () => {
    const parsed = createSparePartSchema.parse({ title: 'موتور', slug: 'motor-x', price: 1000 });
    expect(parsed).toMatchObject({ stockQty: 0, isActive: true, productIds: [] });
  });

  it('rejects a bad slug, non-positive price and bad product id', () => {
    const r = createSparePartSchema.safeParse({
      title: 'موتور',
      slug: 'Bad Slug',
      price: 0,
      productIds: ['x'],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const keys = r.error.issues.map((i) => i.path[0]);
      expect(keys).toEqual(expect.arrayContaining(['slug', 'price', 'productIds']));
    }
  });

  it('product-side replace takes a list of object ids', () => {
    expect(replaceProductSparePartsSchema.parse({ sparePartIds: [OID] }).sparePartIds).toEqual([
      OID,
    ]);
    expect(replaceProductSparePartsSchema.safeParse({ sparePartIds: ['x'] }).success).toBe(false);
  });
});
