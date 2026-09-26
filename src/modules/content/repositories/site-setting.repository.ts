import { Injectable } from '@nestjs/common';
import type { SiteSetting } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `site_settings` collection — key/value config. */
@Injectable()
export class SiteSettingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByKeys(keys: string[]): Promise<SiteSetting[]> {
    return this.prisma.siteSetting.findMany({ where: { key: { in: keys } } });
  }

  findAll(): Promise<SiteSetting[]> {
    return this.prisma.siteSetting.findMany({ orderBy: { key: 'asc' } });
  }

  upsert(key: string, value: string): Promise<SiteSetting> {
    return this.prisma.siteSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
