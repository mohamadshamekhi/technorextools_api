import type { Media, Product, ProductDocument } from '@prisma/client';
import { toDocumentViews, toHighlightViews, toModel3dHotspotViews } from './product-extras.view';

const doc = (over: Partial<ProductDocument> = {}): ProductDocument => ({
  id: 'd1',
  productId: 'p1',
  mediaId: 'm1',
  type: 'catalog',
  title: 'کاتالوگ',
  locale: 'fa',
  sortOrder: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-02-02'),
  ...over,
});

const media = (over: Partial<Media> = {}): Media =>
  ({ id: 'm1', url: 'https://cdn/x.pdf', size: 2048, ...over }) as Media;

describe('product extras views', () => {
  it('stitches a document with its media and rounds the size to KB', () => {
    const [view] = toDocumentViews([doc()], [media()]);
    expect(view).toMatchObject({ url: 'https://cdn/x.pdf', sizeKb: 2, type: 'catalog' });
  });

  it('drops a document whose media row is gone instead of returning a broken url', () => {
    expect(toDocumentViews([doc()], [])).toEqual([]);
  });

  it('never reports a 0 KB file', () => {
    expect(toDocumentViews([doc()], [media({ size: 10 })])[0]?.sizeKb).toBe(1);
  });

  it('maps 3D hotspots to a [x, y, z] position tuple', () => {
    const product = {
      model3dHotspots: [{ key: 'motor', label: 'موتور', description: null, x: 1, y: 2, z: 3 }],
    } as unknown as Product;
    expect(toModel3dHotspotViews(product)).toEqual([
      { id: 'motor', label: 'موتور', description: null, position: [1, 2, 3] },
    ]);
  });

  it('tolerates old documents with no embedded arrays', () => {
    const legacy = {} as unknown as Product;
    expect(toHighlightViews(legacy)).toEqual([]);
    expect(toModel3dHotspotViews(legacy)).toEqual([]);
  });
});
