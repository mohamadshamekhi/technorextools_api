import { BrandsImportService, slugifyBrandTitle } from './brands-import.service';
import { importBrandsSchema } from './brands.schemas';

type Repo = {
  findMany: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};

function make(): {
  service: BrandsImportService;
  brands: Repo;
  media: { findByOwners: jest.Mock };
  mediaService: { uploadFromUrl: jest.Mock; delete: jest.Mock };
} {
  const brands: Repo = {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(({ slug, title }: { slug: string; title: string }) =>
      Promise.resolve({
        id: `id-${slug}`,
        slug,
        title,
        isExclusiveDistributor: false,
        authenticityNote: null,
      }),
    ),
    update: jest.fn((id: string, data: Record<string, unknown>) =>
      Promise.resolve({ id, ...data }),
    ),
  };
  const media = { findByOwners: jest.fn().mockResolvedValue([]) };
  const mediaService = {
    uploadFromUrl: jest.fn().mockResolvedValue({ id: 'm1' }),
    delete: jest.fn(),
  };
  const service = new BrandsImportService(brands as never, media as never, mediaService as never);
  return { service, brands, media, mediaService };
}

const parse = (raw: unknown): ReturnType<typeof importBrandsSchema.parse> =>
  importBrandsSchema.parse(raw);

describe('slugifyBrandTitle', () => {
  it('derives a slug from a latin title', () => {
    expect(slugifyBrandTitle('Bosch Power Tools')).toBe('bosch-power-tools');
  });

  it('returns empty for a title with no latin characters', () => {
    expect(slugifyBrandTitle('بوش')).toBe('');
  });
});

describe('BrandsImportService.import', () => {
  it('creates new brands and uploads their logo', async () => {
    const { service, brands, mediaService } = make();
    const result = await service.import(
      parse({ brands: [{ title: 'Bosch', logoSourceUrl: 'https://cdn.test/bosch.png' }] }),
      'admin-1',
    );

    expect(brands.create).toHaveBeenCalledTimes(1);
    expect(mediaService.uploadFromUrl).toHaveBeenCalledWith(
      'https://cdn.test/bosch.png',
      expect.objectContaining({ ownerType: 'BRAND', ownerId: 'id-bosch', purpose: 'LOGO' }),
      'admin-1',
    );
    expect(result).toMatchObject({ created: 1, updated: 0, failed: 0 });
    expect(result.items[0]).toMatchObject({ slug: 'bosch', status: 'created', logo: 'uploaded' });
  });

  it('updates an existing brand by slug and reports unchanged ones', async () => {
    const { service, brands } = make();
    brands.findMany.mockResolvedValue([
      {
        id: 'b1',
        slug: 'bosch',
        title: 'Bosch',
        isExclusiveDistributor: false,
        authenticityNote: null,
      },
      {
        id: 'b2',
        slug: 'makita',
        title: 'Makita',
        isExclusiveDistributor: false,
        authenticityNote: null,
      },
    ]);

    const result = await service.import(
      parse({
        brands: [
          { title: 'Bosch Iran', slug: 'bosch' },
          { title: 'Makita', slug: 'makita' },
        ],
      }),
    );

    expect(brands.create).not.toHaveBeenCalled();
    expect(brands.update).toHaveBeenCalledWith('b1', { title: 'Bosch Iran' });
    expect(result).toMatchObject({ created: 0, updated: 1, unchanged: 1, failed: 0 });
  });

  it('fails a non-latin title with no explicit slug without aborting the batch', async () => {
    const { service, brands } = make();
    const result = await service.import(parse({ brands: [{ title: 'بوش' }, { title: 'Makita' }] }));

    expect(result).toMatchObject({ created: 1, failed: 1 });
    expect(result.items[0]?.error).toContain('slug');
    expect(brands.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a slug repeated inside the same payload', async () => {
    const { service } = make();
    const result = await service.import(
      parse({ brands: [{ title: 'Bosch' }, { title: 'Bosch' }] }),
    );
    expect(result).toMatchObject({ created: 1, failed: 1 });
  });

  it('keeps an existing logo unless replaceLogo is set', async () => {
    const { service, brands, media, mediaService } = make();
    brands.findMany.mockResolvedValue([
      {
        id: 'b1',
        slug: 'bosch',
        title: 'Bosch',
        isExclusiveDistributor: false,
        authenticityNote: null,
      },
    ]);
    media.findByOwners.mockResolvedValue([
      { id: 'old', ownerId: 'b1', purpose: 'LOGO', url: 'https://cdn/old.webp' },
    ]);

    const payload = {
      brands: [{ title: 'Bosch', slug: 'bosch', logoSourceUrl: 'https://cdn.test/b.png' }],
    };
    const kept = await service.import(parse(payload));
    expect(mediaService.uploadFromUrl).not.toHaveBeenCalled();
    expect(kept.items[0]?.logo).toBe('skipped');

    const replaced = await service.import(parse({ ...payload, replaceLogo: true }));
    expect(mediaService.uploadFromUrl).toHaveBeenCalledTimes(1);
    expect(mediaService.delete).toHaveBeenCalledWith('old');
    expect(replaced.items[0]?.logo).toBe('uploaded');
  });

  it('reports a failed logo download without failing the brand', async () => {
    const { service, mediaService } = make();
    mediaService.uploadFromUrl.mockRejectedValue(new Error('آدرس فایل مجاز نیست'));
    const result = await service.import(
      parse({ brands: [{ title: 'Bosch', logoSourceUrl: 'https://cdn.test/x.png' }] }),
    );
    expect(result).toMatchObject({ created: 1, failed: 0 });
    expect(result.items[0]).toMatchObject({ logo: 'failed', error: 'آدرس فایل مجاز نیست' });
  });

  it('writes nothing on a dry run', async () => {
    const { service, brands, mediaService } = make();
    const result = await service.import(
      parse({
        dryRun: true,
        brands: [{ title: 'Bosch', logoSourceUrl: 'https://cdn.test/b.png' }],
      }),
    );
    expect(brands.create).not.toHaveBeenCalled();
    expect(mediaService.uploadFromUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dryRun: true, created: 1 });
  });
});
