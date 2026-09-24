import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ProductRepository } from '../../catalog/repositories/product.repository';
import { MediaRepository } from '../../media/repositories/media.repository';
import { SparePartRepository } from '../../spare-parts/repositories/spare-part.repository';
import { toSparePartView, type SparePartView } from '../../spare-parts/spare-part.view';
import type {
  CreateSparePartInput,
  ListSparePartsQuery,
  UpdateSparePartInput,
} from './backoffice-spare-parts.schemas';

@Injectable()
export class BackofficeSparePartsService {
  constructor(
    private readonly spareParts: SparePartRepository,
    private readonly products: ProductRepository,
    private readonly media: MediaRepository,
  ) {}

  async list(query: ListSparePartsQuery) {
    const where: Prisma.SparePartWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.productId ? { compatibleProducts: { some: { productId: query.productId } } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { partNumber: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.spareParts.paginate(where, query.skip, query.take);
    return { items: await this.toViews(rows), total, skip: query.skip, take: query.take };
  }

  async getById(id: string): Promise<SparePartView> {
    return (await this.toViews([await this.require(id)]))[0]!;
  }

  async create(input: CreateSparePartInput): Promise<SparePartView> {
    await this.assertUnique(input.slug, input.partNumber);
    const productIds = await this.assertProducts(input.productIds);
    const created = await this.spareParts.create(withoutProductIds(input), productIds);
    return (await this.toViews([created]))[0]!;
  }

  async update(id: string, input: UpdateSparePartInput): Promise<SparePartView> {
    const current = await this.require(id);
    if (input.slug && input.slug !== current.slug) await this.assertUnique(input.slug, null);
    if (input.partNumber && input.partNumber !== current.partNumber) {
      await this.assertUnique(null, input.partNumber);
    }
    const productIds = input.productIds ? await this.assertProducts(input.productIds) : undefined;
    const updated = await this.spareParts.update(id, withoutProductIds(input), productIds);
    return (await this.toViews([updated]))[0]!;
  }

  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.spareParts.softDelete(id);
  }

  // ── product side ───────────────────────────────────────────────────────────

  async listForProduct(productId: string): Promise<SparePartView[]> {
    await this.requireProduct(productId);
    return this.toViews(await this.spareParts.findByProductId(productId, false));
  }

  async replaceForProduct(productId: string, sparePartIds: string[]): Promise<SparePartView[]> {
    await this.requireProduct(productId);
    const ids = [...new Set(sparePartIds)];
    if (ids.length > 0 && (await this.spareParts.countByIds(ids)) !== ids.length) {
      throw new BadRequestException('یک یا چند قطعه یدکی یافت نشد');
    }
    await this.spareParts.replaceForProduct(productId, ids);
    return this.listForProduct(productId);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async require(id: string) {
    const row = await this.spareParts.findById(id);
    if (!row) throw new NotFoundException('قطعه یدکی یافت نشد');
    return row;
  }

  private async requireProduct(productId: string): Promise<void> {
    const product = await this.products.findById(productId);
    if (!product || product.deletedAt !== null) throw new NotFoundException('محصول یافت نشد');
  }

  private async assertUnique(slug: string | null, partNumber: string | null): Promise<void> {
    if (slug && (await this.spareParts.findAnyBySlug(slug))) {
      throw new ConflictException('این اسلاگ قبلاً استفاده شده است');
    }
    if (partNumber && (await this.spareParts.findAnyByPartNumber(partNumber))) {
      throw new ConflictException('این شماره قطعه قبلاً ثبت شده است');
    }
  }

  private async assertProducts(productIds: string[]): Promise<string[]> {
    const ids = [...new Set(productIds)];
    if (ids.length > 0 && (await this.products.countByIds(ids)) !== ids.length) {
      throw new BadRequestException('یک یا چند محصول یافت نشد');
    }
    return ids;
  }

  private async toViews(rows: Awaited<ReturnType<SparePartRepository['paginate']>>[0]) {
    const media = await this.media.findByOwners(
      'SPARE_PART',
      rows.map((r) => r.id),
    );
    return rows.map((r) =>
      toSparePartView(
        r,
        media.filter((m) => m.ownerId === r.id),
      ),
    );
  }
}

/** `productIds` is a junction concern, not a `spare_parts` column. */
function withoutProductIds<T extends { productIds?: unknown }>(input: T): Omit<T, 'productIds'> {
  const copy: Record<string, unknown> = { ...input };
  delete copy.productIds;
  return copy as Omit<T, 'productIds'>;
}
