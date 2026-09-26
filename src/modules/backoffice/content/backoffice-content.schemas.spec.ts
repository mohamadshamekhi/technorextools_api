import {
  createArticleSchema,
  updateArticleSchema,
  upsertSeoSchema,
} from './backoffice-content.schemas';

describe('backoffice content schemas', () => {
  it('accepts a valid article and drops no real field', () => {
    const parsed = createArticleSchema.parse({ title: 'مقاله', slug: 'a-post', body: 'متن' });
    expect(parsed).toEqual({
      title: 'مقاله',
      slug: 'a-post',
      body: 'متن',
      excerpt: null,
      publishedAt: null,
    });
    expect('coverImage' in parsed).toBe(false);
  });

  it('rejects coverImage on create and update instead of silently dropping it', () => {
    for (const schema of [createArticleSchema, updateArticleSchema]) {
      const res = schema.safeParse({
        title: 'مقاله',
        slug: 'a-post',
        body: 'متن',
        coverImage: 'https://x/c.webp',
      });
      expect(res.success).toBe(false);
      expect(res.success === false && res.error.issues[0]?.path).toEqual(['coverImage']);
    }
  });

  it('rejects ogImage on the SEO upsert', () => {
    const res = upsertSeoSchema.safeParse({
      entityType: 'article',
      entityId: 'a'.repeat(24),
      ogImage: 'https://x/og.webp',
    });
    expect(res.success).toBe(false);
    expect(res.success === false && res.error.issues[0]?.path).toEqual(['ogImage']);
  });
});
