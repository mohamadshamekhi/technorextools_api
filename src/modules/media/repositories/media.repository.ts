import { Injectable } from '@nestjs/common';
import type { MediaOwnerType, MediaPurpose, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `media` collection. */
@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.MediaUncheckedCreateInput) {
    return this.prisma.media.create({ data });
  }

  findById(id: string) {
    return this.prisma.media.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.MediaUpdateInput) {
    return this.prisma.media.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.media.delete({ where: { id } });
  }

  /** All media for one owner, ordered for display. */
  findByOwner(ownerType: MediaOwnerType, ownerId: string) {
    return this.prisma.media.findMany({
      where: { ownerType, ownerId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Media for many owners of the same type — used to stitch galleries into list views. */
  findByOwners(ownerType: MediaOwnerType, ownerIds: string[]) {
    if (ownerIds.length === 0) return Promise.resolve([]);
    return this.prisma.media.findMany({
      where: { ownerType, ownerId: { in: ownerIds } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** A product's own media plus its variants' media, in one query. */
  findProductMedia(productId: string, variantIds: string[] = []) {
    return this.prisma.media.findMany({
      where: {
        OR: [
          { ownerType: 'PRODUCT', ownerId: productId },
          ...(variantIds.length
            ? [{ ownerType: 'PRODUCT_VARIANT' as const, ownerId: { in: variantIds } }]
            : []),
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Drop the `isMain` flag from every other row of the same owner + purpose. */
  clearMainFlag(ownerType: MediaOwnerType, ownerId: string, purpose: MediaPurpose, exceptId?: string) {
    return this.prisma.media.updateMany({
      where: {
        ownerType,
        ownerId,
        purpose,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isMain: false },
    });
  }
}
