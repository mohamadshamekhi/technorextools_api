import { updateMediaSchema, uploadMediaSchema } from './media.schemas';

describe('uploadMediaSchema', () => {
  it('treats explicit null on optional fields as "not provided"', () => {
    const parsed = uploadMediaSchema.parse({
      ownerType: null,
      ownerId: null,
      purpose: null,
      alt: null,
      isMain: null,
      sortOrder: null,
      folder: null,
    });
    expect(parsed).toEqual({ purpose: 'ATTACHMENT' });
  });

  it('accepts a fully specified payload', () => {
    const parsed = uploadMediaSchema.parse({
      ownerType: 'PRODUCT',
      ownerId: 'a'.repeat(24),
      purpose: 'GALLERY',
      isMain: 'true',
      sortOrder: '3',
    });
    expect(parsed).toMatchObject({ ownerType: 'PRODUCT', purpose: 'GALLERY', isMain: true, sortOrder: 3 });
  });

  it('rejects ownerId without ownerType', () => {
    expect(uploadMediaSchema.safeParse({ ownerId: 'a'.repeat(24) }).success).toBe(false);
  });
});

describe('updateMediaSchema', () => {
  it('keeps an explicit null on alt (clears the caption) but drops it elsewhere', () => {
    expect(updateMediaSchema.parse({ alt: null, purpose: null })).toEqual({ alt: null });
  });

  it('rejects an empty patch', () => {
    expect(updateMediaSchema.safeParse({ purpose: null, isMain: null }).success).toBe(false);
  });
});
