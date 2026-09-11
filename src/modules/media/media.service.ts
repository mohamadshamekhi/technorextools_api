import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Media, MediaKind, MediaOwnerType } from '@prisma/client';
import type { Env } from '../../config/env.schema';
import { BrandRepository } from '../catalog/repositories/brand.repository';
import { CategoryRepository } from '../catalog/repositories/category.repository';
import { ProductRepository } from '../catalog/repositories/product.repository';
import { ProductVariantRepository } from '../catalog/repositories/product-variant.repository';
import { MediaRepository } from './repositories/media.repository';
import { convertToWebp, WEBP_CONVERTIBLE_TYPES } from './image-webp';
import { presignDelete, presignPut, type S3Config } from './s3-presigner';
import type { ListMediaQuery, UpdateMediaInput, UploadMediaInput } from './media.schemas';

/** contentType → file extension fallback when the original name has none. */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
};

/** ACL sent on every upload so objects are world-readable regardless of bucket policy. */
const UPLOAD_ACL = 'public-read';

/** Hard cap on a single upload — 50 MB. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Minimal shape of a multer file — avoids depending on the Express.Multer global. */
export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

export interface MediaView {
  id: string;
  url: string;
  key: string;
  contentType: string;
  size: number;
  originalName: string | null;
  kind: MediaKind;
  ownerType: MediaOwnerType | null;
  ownerId: string | null;
  purpose: Media['purpose'];
  alt: string | null;
  isMain: boolean;
  sortOrder: number;
  createdAt: string;
}

function extFromName(name: string): string | undefined {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m?.[1]?.toLowerCase();
}

function kindOf(contentType: string): MediaKind {
  if (contentType.startsWith('image/')) return 'IMAGE';
  if (contentType === 'model/gltf-binary' || contentType === 'model/gltf+json') return 'MODEL';
  if (contentType === 'application/pdf' || contentType.startsWith('text/')) return 'DOCUMENT';
  return 'OTHER';
}

@Injectable()
export class MediaService {
  private readonly s3: S3Config | null;

  constructor(
    config: ConfigService<Env, true>,
    private readonly media: MediaRepository,
    private readonly products: ProductRepository,
    private readonly variants: ProductVariantRepository,
    private readonly brands: BrandRepository,
    private readonly categories: CategoryRepository,
  ) {
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const bucket = config.get('S3_BUCKET', { infer: true });
    const accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true });
    const publicBaseUrl = config.get('S3_PUBLIC_BASE_URL', { infer: true });
    this.s3 =
      endpoint && bucket && accessKeyId && secretAccessKey && publicBaseUrl
        ? {
            endpoint,
            region: config.get('S3_REGION', { infer: true }),
            bucket,
            accessKeyId,
            secretAccessKey,
            publicBaseUrl,
          }
        : null;
  }

  /**
   * Accept a raw file, store it in object storage server-side (SigV4 presigned
   * PUT + `fetch`), and persist a `Media` row — optionally attached to an owner.
   */
  async upload(
    file: UploadedFile | undefined,
    input: UploadMediaInput,
    uploadedById?: string,
  ): Promise<MediaView> {
    if (!this.s3) {
      throw new ServiceUnavailableException('سرویس آپلود پیکربندی نشده است');
    }
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('فایلی ارسال نشده است');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('حجم فایل بیش از حد مجاز است (حداکثر ۵۰ مگابایت)');
    }
    if (input.ownerType && input.ownerId) {
      await this.ensureOwnerExists(input.ownerType, input.ownerId);
    }

    const sourceType = file.mimetype || 'application/octet-stream';

    // JPEG/PNG are re-encoded to WebP server-side; everything else is stored as-is.
    let body = file.buffer;
    let contentType = sourceType;
    if (WEBP_CONVERTIBLE_TYPES.has(sourceType)) {
      try {
        body = await convertToWebp(file.buffer);
      } catch {
        throw new BadRequestException('تصویر نامعتبر است یا قابل پردازش نیست');
      }
      contentType = 'image/webp';
    }
    const size = body.length;

    const ext =
      contentType === 'image/webp' && contentType !== sourceType
        ? 'webp'
        : (extFromName(file.originalname) ?? MIME_EXT[contentType] ?? 'bin');
    const safeFolder = /^[a-z0-9-]{1,40}$/.test(input.folder ?? '') ? input.folder! : 'misc';
    const d = new Date();
    const key = `${safeFolder}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;

    const uploadUrl = presignPut(this.s3, key, 300, { acl: UPLOAD_ACL });
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: { 'x-amz-acl': UPLOAD_ACL, 'content-type': contentType },
    });
    if (!res.ok) {
      throw new ServiceUnavailableException('آپلود فایل ناموفق بود');
    }

    const row = await this.media.create({
      key,
      url: `${this.s3.publicBaseUrl.replace(/\/$/, '')}/${key}`,
      contentType,
      size,
      originalName: file.originalname || null,
      kind: kindOf(contentType),
      ownerType: input.ownerType ?? null,
      ownerId: input.ownerId ?? null,
      purpose: input.purpose,
      alt: input.alt ?? null,
      isMain: input.isMain ?? false,
      sortOrder: input.sortOrder ?? 0,
      uploadedById: uploadedById ?? null,
    });
    if (row.isMain && row.ownerType && row.ownerId) {
      await this.media.clearMainFlag(row.ownerType, row.ownerId, row.purpose, row.id);
    }
    return toView(row);
  }

  async listByOwner(query: ListMediaQuery): Promise<MediaView[]> {
    const rows = await this.media.findByOwner(query.ownerType, query.ownerId);
    return rows.map(toView);
  }

  async update(id: string, input: UpdateMediaInput): Promise<MediaView> {
    const row = await this.media.findById(id);
    if (!row) {
      throw new NotFoundException('رسانه یافت نشد');
    }
    const updated = await this.media.update(id, {
      ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
      ...(input.alt !== undefined ? { alt: input.alt } : {}),
      ...(input.isMain !== undefined ? { isMain: input.isMain } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    });
    if (updated.isMain && updated.ownerType && updated.ownerId) {
      await this.media.clearMainFlag(updated.ownerType, updated.ownerId, updated.purpose, updated.id);
    }
    return toView(updated);
  }

  async delete(id: string): Promise<void> {
    const row = await this.media.findById(id);
    if (!row) {
      throw new NotFoundException('رسانه یافت نشد');
    }
    if (this.s3) {
      // Best-effort — a failed storage delete must not block removing the row.
      try {
        await fetch(presignDelete(this.s3, row.key, 300), { method: 'DELETE' });
      } catch {
        /* orphaned object is swept later, not worth failing the request */
      }
    }
    await this.media.delete(id);
  }

  private async ensureOwnerExists(ownerType: MediaOwnerType, ownerId: string): Promise<void> {
    const exists = async (): Promise<boolean> => {
      switch (ownerType) {
        case 'PRODUCT':
          return !!(await this.products.findById(ownerId));
        case 'PRODUCT_VARIANT':
          return !!(await this.variants.findById(ownerId));
        case 'BRAND':
          return !!(await this.brands.findById(ownerId));
        case 'CATEGORY':
          return !!(await this.categories.findById(ownerId));
        default:
          throw new BadRequestException('این نوع مالک هنوز پشتیبانی نمی‌شود');
      }
    };
    if (!(await exists())) {
      throw new BadRequestException('مالک انتخاب‌شده وجود ندارد');
    }
  }
}

function toView(m: Media): MediaView {
  return {
    id: m.id,
    url: m.url,
    key: m.key,
    contentType: m.contentType,
    size: m.size,
    originalName: m.originalName,
    kind: m.kind,
    ownerType: m.ownerType,
    ownerId: m.ownerId,
    purpose: m.purpose,
    alt: m.alt,
    isMain: m.isMain,
    sortOrder: m.sortOrder,
    createdAt: m.createdAt.toISOString(),
  };
}
