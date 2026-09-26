import { createBrandSchema, updateBrandSchema } from './brands.schemas';

describe('brand schemas', () => {
  const base = { title: 'پوما', slug: 'puma', authenticityNote: null };

  it('rejects logoUrl instead of silently dropping it', () => {
    for (const schema of [createBrandSchema, updateBrandSchema]) {
      const res = schema.safeParse({ ...base, logoUrl: 'https://x/l.webp' });
      expect(res.success).toBe(false);
      expect(res.success === false && res.error.issues[0]?.path).toEqual(['logoUrl']);
    }
  });

  it('parses a valid brand without a logoUrl key', () => {
    const parsed = createBrandSchema.parse(base);
    expect(parsed).toEqual({ ...base, isExclusiveDistributor: false });
    expect('logoUrl' in parsed).toBe(false);
  });
});
