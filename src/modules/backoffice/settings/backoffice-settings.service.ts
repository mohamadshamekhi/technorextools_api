import { Injectable } from '@nestjs/common';
import type { SiteSetting } from '@prisma/client';
import { SiteSettingRepository } from '../../content/repositories/site-setting.repository';

@Injectable()
export class BackofficeSettingsService {
  constructor(private readonly settings: SiteSettingRepository) {}

  list() {
    return this.settings.findAll();
  }

  async put(entries: Array<{ key: string; value: string }>): Promise<SiteSetting[]> {
    const out: SiteSetting[] = [];
    for (const entry of entries) {
      out.push(await this.settings.upsert(entry.key, entry.value));
    }
    return out;
  }
}
