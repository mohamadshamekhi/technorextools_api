import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { convertToWebp } from './image-webp';
import type * as ImageWebpModule from './image-webp';
import { MAX_UPLOAD_BYTES, MediaService, type UploadedFile } from './media.service';

jest.mock('./image-webp', () => {
  const actual: typeof ImageWebpModule = jest.requireActual('./image-webp');
  return {
    ...actual,
    convertToWebp: jest.fn(() => Promise.resolve(Buffer.from('webp-bytes-xxxxxx'))),
  };
});

const convertToWebpMock = convertToWebp as jest.MockedFunction<typeof convertToWebp>;
import type { MediaRepository } from './repositories/media.repository';
import type { ProductRepository } from '../catalog/repositories/product.repository';
import type { ProductVariantRepository } from '../catalog/repositories/product-variant.repository';
import type { BrandRepository } from '../catalog/repositories/brand.repository';
import type { CategoryRepository } from '../catalog/repositories/category.repository';
import type { UploadMediaInput } from './media.schemas';

const S3_ENV: Record<string, unknown> = {
  S3_ENDPOINT: 'https://s3.example.com',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'abzar',
  S3_ACCESS_KEY_ID: 'ak',
  S3_SECRET_ACCESS_KEY: 'sk',
  S3_PUBLIC_BASE_URL: 'https://cdn.example.com',
};

function make(
  env: Record<string, unknown> = S3_ENV,
  over: Partial<Record<string, jest.Mock>> = {},
) {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const media = {
    create:
      over.create ?? jest.fn((d) => Promise.resolve({ id: 'm1', createdAt: new Date(), ...d })),
    clearMainFlag: jest.fn().mockResolvedValue(undefined),
    findById: over.findById ?? jest.fn().mockResolvedValue(null),
    findUnattachedByIds: over.findUnattachedByIds ?? jest.fn().mockResolvedValue([]),
    attachToOwner: over.attachToOwner ?? jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as MediaRepository;
  const products = {
    findById: over.productFindById ?? jest.fn().mockResolvedValue({ id: 'p1' }),
  } as unknown as ProductRepository;
  const variants = {
    findById: jest.fn().mockResolvedValue({ id: 'v1' }),
  } as unknown as ProductVariantRepository;
  const brands = {
    findById: jest.fn().mockResolvedValue({ id: 'b1' }),
  } as unknown as BrandRepository;
  const categories = {
    findById: jest.fn().mockResolvedValue({ id: 'c1' }),
  } as unknown as CategoryRepository;
  return {
    service: new MediaService(
      config as never,
      media,
      products,
      variants,
      brands,
      categories,
      { findById: jest.fn().mockResolvedValue({ id: 's1' }) } as never,
      { findById: jest.fn().mockResolvedValue({ id: 'bundle1' }) } as never,
      { findById: over.articleFindById ?? jest.fn().mockResolvedValue({ id: 'a1' }) } as never,
    ),
    media,
    products,
  };
}

function file(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    buffer: Buffer.from('hello'),
    mimetype: 'image/png',
    size: 5,
    originalname: 'a.png',
    ...overrides,
  };
}

const input = (o: Partial<UploadMediaInput> = {}): UploadMediaInput => ({
  purpose: 'GALLERY',
  ...o,
});

describe('MediaService.upload', () => {
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => {
    convertToWebpMock.mockClear();
    convertToWebpMock.mockResolvedValue(Buffer.from('webp-bytes-xxxxxx'));
  });

  it('converts a PNG to WebP, PUTs it and persists a Media row', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const { service, media } = make();
    const res = await service.upload(
      file(),
      input({ ownerType: 'PRODUCT', ownerId: 'p'.repeat(24) }),
      'u1',
    );

    expect(convertToWebpMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('PUT');
    expect(media.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'IMAGE',
        contentType: 'image/webp',
        size: Buffer.from('webp-bytes-xxxxxx').length,
        purpose: 'GALLERY',
        ownerType: 'PRODUCT',
        uploadedById: 'u1',
      }),
    );
    expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/misc\/.+\.webp$/);
  });

  it('accepts ARTICLE as an owner type (article cover / og image)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const { service, media } = make();
    await service.upload(
      file(),
      input({ purpose: 'COVER', ownerType: 'ARTICLE', ownerId: 'a'.repeat(24) }),
      'u1',
    );
    expect(media.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerType: 'ARTICLE', purpose: 'COVER' }),
    );
  });

  it('rejects an ARTICLE owner that does not exist', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const { service } = make(S3_ENV, { articleFindById: jest.fn().mockResolvedValue(null) });
    await expect(
      service.upload(
        file(),
        input({ purpose: 'COVER', ownerType: 'ARTICLE', ownerId: 'a'.repeat(24) }),
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an image sharp cannot decode', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    convertToWebpMock.mockRejectedValueOnce(new Error('bad image'));
    await expect(
      make().service.upload(file({ mimetype: 'image/jpeg' }), input()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores a non-convertible type as-is', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const { service, media } = make();
    const res = await service.upload(
      file({ mimetype: 'application/pdf', originalname: 'a.pdf' }),
      input(),
    );

    expect(convertToWebpMock).not.toHaveBeenCalled();
    expect(media.create).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'application/pdf', size: 5 }),
    );
    expect(res.url).toMatch(/\.pdf$/);
  });

  it('rejects a missing file', async () => {
    await expect(make().service.upload(undefined, input())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a file over the size cap', async () => {
    await expect(
      make().service.upload(file({ size: MAX_UPLOAD_BYTES + 1 }), input()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an owner that does not exist', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const { service } = make(S3_ENV, { productFindById: jest.fn().mockResolvedValue(null) });
    await expect(
      service.upload(file(), input({ ownerType: 'PRODUCT', ownerId: 'p'.repeat(24) })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('503s when storage is not configured', async () => {
    await expect(make({}).service.upload(file(), input())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('surfaces an upstream failure as 503', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(make().service.upload(file(), input())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('MediaService attachments', () => {
  afterEach(() => jest.restoreAllMocks());

  it("rejects an attachment that is not the caller's own unattached upload", async () => {
    const { service } = make(S3_ENV, { findUnattachedByIds: jest.fn().mockResolvedValue([]) });
    await expect(
      service.attachToOwner(['a'.repeat(24)], 'TICKET_MESSAGE', 'm'.repeat(24), 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("binds the uploader's own rows to the owner", async () => {
    const attachToOwner = jest.fn().mockResolvedValue(undefined);
    const { service } = make(S3_ENV, {
      findUnattachedByIds: jest.fn().mockResolvedValue([{ id: 'a'.repeat(24) }]),
      attachToOwner,
    });
    await service.attachToOwner(['a'.repeat(24)], 'TICKET_MESSAGE', 'm'.repeat(24), 'u1');
    expect(attachToOwner).toHaveBeenCalledWith(['a'.repeat(24)], 'TICKET_MESSAGE', 'm'.repeat(24));
  });

  it('refuses an oversized or wrong-typed customer attachment', async () => {
    const { service } = make();
    await expect(
      service.uploadAttachment(file({ size: 11 * 1024 * 1024 }), {}, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.uploadAttachment(file({ mimetype: 'application/zip' }), {}, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
