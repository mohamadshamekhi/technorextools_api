import { Injectable } from '@nestjs/common';
import type { Prisma, SeoMeta } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `seo_meta` collection — per-entity meta tags. */
@Injectable()
export class SeoMetaRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEntity(entityType: string, entityId: string): Promise<SeoMeta | null> {
    return this.prisma.seoMeta.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
    });
  }

  upsert(
    entityType: string,
    entityId: string,
    data: Omit<Prisma.SeoMetaCreateInput, 'entityType' | 'entityId'>,
  ): Promise<SeoMeta> {
    return this.prisma.seoMeta.upsert({
      where: { entityType_entityId: { entityType, entityId } },
      create: { entityType, entityId, ...data },
      update: data,
    });
  }

  delete(entityType: string, entityId: string): Promise<SeoMeta> {
    return this.prisma.seoMeta.delete({
      where: { entityType_entityId: { entityType, entityId } },
    });
  }
}
