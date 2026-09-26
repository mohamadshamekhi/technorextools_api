import { Injectable, Logger } from '@nestjs/common';
import type { Brand } from '@prisma/client';
import { BrandRepository } from '../../catalog/repositories/brand.repository';
import { MediaService } from '../../media/media.service';
import { MediaRepository } from '../../media/repositories/media.repository';
import type { ImportBrandItemInput, ImportBrandsInput } from './brands.schemas';

export type ImportItemStatus = 'created' | 'updated' | 'unchanged' | 'failed';
export type ImportLogoStatus = 'uploaded' | 'skipped' | 'failed' | 'none';

export interface ImportBrandResult {
  title: string;
  slug: string | null;
  status: ImportItemStatus;
  brandId: string | null;
  logo: ImportLogoStatus;
  error: string | null;
}

export interface ImportBrandsResult {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  items: ImportBrandResult[];
}

/** How many logos are downloaded at once — polite to the source site. */
const LOGO_CONCURRENCY = 4;

/**
 * Latin-ish slug from a title. Persian titles produce nothing usable, so the
 * crawler must send an explicit `slug` for those — we fail that item loudly
 * rather than inventing an id.
 */
export function slugifyBrandTitle(title: string): string {
  return title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
}

/**
 * Bulk brand import for the crawler. Per-item isolation: a bad row (or a logo
 * that won't download) is reported in `items[]` and never aborts the batch.
 * Re-running the same payload is a no-op beyond updates, so the crawler is safe
 * to schedule.
 */
@Injectable()
export class BrandsImportService {
  private readonly logger = new Logger(BrandsImportService.name);

  constructor(
    private readonly brands: BrandRepository,
    private readonly media: MediaRepository,
    private readonly mediaService: MediaService,
  ) {}

  async import(input: ImportBrandsInput, actorId?: string): Promise<ImportBrandsResult> {
    const items: ImportBrandResult[] = [];
    // Resolve every slug up front so both the duplicate check and the existing-row
    // lookup cost one query instead of one per brand.
    const resolved = input.brands.map((b) => ({
      raw: b,
      slug: b.slug ?? slugifyBrandTitle(b.title),
    }));
    const existing = await this.existingBySlug(resolved.map((r) => r.slug).filter(Boolean));
    const logoOwners = await this.brandsWithLogo([...existing.values()].map((b) => b.id));

    const seen = new Set<string>();
    /** Items whose row is settled and that still want a logo downloaded. */
    const pendingLogos: { result: ImportBrandResult; url: string; previousLogoId?: string }[] = [];

    for (const { raw, slug } of resolved) {
      const result: ImportBrandResult = {
        title: raw.title,
        slug: slug || null,
        status: 'failed',
        brandId: null,
        logo: 'none',
        error: null,
      };
      items.push(result);

      if (!slug) {
        result.error = 'اسلاگ قابل تولید نیست — برای عنوان غیرلاتین باید slug ارسال شود';
        continue;
      }
      if (seen.has(slug)) {
        result.error = 'این اسلاگ در همین درخواست تکراری است';
        continue;
      }
      seen.add(slug);

      const current = existing.get(slug);
      try {
        const saved = await this.upsert(raw, slug, current, input.dryRun);
        result.brandId = saved.brand?.id ?? null;
        result.status = saved.status;
      } catch (err) {
        result.error = err instanceof Error ? err.message : 'ثبت برند ناموفق بود';
        continue;
      }

      const logoUrl = raw.logoSourceUrl;
      if (!logoUrl) continue;
      const previousLogoId = result.brandId ? logoOwners.get(result.brandId) : undefined;
      if (previousLogoId && !input.replaceLogo) {
        result.logo = 'skipped';
        continue;
      }
      if (input.dryRun) {
        result.logo = 'skipped';
        continue;
      }
      pendingLogos.push({ result, url: logoUrl, ...(previousLogoId ? { previousLogoId } : {}) });
    }

    await this.downloadLogos(pendingLogos, actorId);

    const count = (s: ImportItemStatus): number => items.filter((i) => i.status === s).length;
    const summary: ImportBrandsResult = {
      dryRun: input.dryRun,
      total: items.length,
      created: count('created'),
      updated: count('updated'),
      unchanged: count('unchanged'),
      failed: count('failed'),
      items,
    };
    this.logger.log(
      `brand import source=${input.source ?? 'unknown'} total=${summary.total} created=${summary.created} updated=${summary.updated} failed=${summary.failed} dryRun=${summary.dryRun}`,
    );
    return summary;
  }

  private async upsert(
    raw: ImportBrandItemInput,
    slug: string,
    current: Brand | undefined,
    dryRun: boolean,
  ): Promise<{ brand: Brand | null; status: ImportItemStatus }> {
    if (!current) {
      if (dryRun) return { brand: null, status: 'created' };
      const brand = await this.brands.create({
        title: raw.title,
        slug,
        isExclusiveDistributor: raw.isExclusiveDistributor ?? false,
        ...(raw.authenticityNote != null ? { authenticityNote: raw.authenticityNote } : {}),
      });
      return { brand, status: 'created' };
    }

    // Only fields the crawler actually sent are considered — an omitted field
    // never clears an admin's manual edit.
    const patch: Record<string, unknown> = {};
    if (raw.title !== current.title) patch['title'] = raw.title;
    if (
      raw.isExclusiveDistributor !== undefined &&
      raw.isExclusiveDistributor !== current.isExclusiveDistributor
    ) {
      patch['isExclusiveDistributor'] = raw.isExclusiveDistributor;
    }
    if (raw.authenticityNote !== undefined && raw.authenticityNote !== current.authenticityNote) {
      patch['authenticityNote'] = raw.authenticityNote;
    }
    if (!Object.keys(patch).length) return { brand: current, status: 'unchanged' };
    if (dryRun) return { brand: current, status: 'updated' };
    const brand = await this.brands.update(current.id, patch);
    return { brand, status: 'updated' };
  }

  private async downloadLogos(
    pending: { result: ImportBrandResult; url: string; previousLogoId?: string }[],
    actorId?: string,
  ): Promise<void> {
    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (let i = cursor++; i < pending.length; i = cursor++) {
        const job = pending[i];
        if (!job?.result.brandId) continue;
        try {
          await this.mediaService.uploadFromUrl(
            job.url,
            {
              ownerType: 'BRAND',
              ownerId: job.result.brandId,
              purpose: 'LOGO',
              isMain: true,
              folder: 'brands',
            },
            actorId,
          );
          if (job.previousLogoId) await this.mediaService.delete(job.previousLogoId);
          job.result.logo = 'uploaded';
        } catch (err) {
          job.result.logo = 'failed';
          job.result.error = err instanceof Error ? err.message : 'دریافت لوگو ناموفق بود';
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(LOGO_CONCURRENCY, pending.length) }, () => worker()),
    );
  }

  private async existingBySlug(slugs: string[]): Promise<Map<string, Brand>> {
    if (!slugs.length) return new Map();
    const rows = await this.brands.findMany({ slug: { in: slugs } });
    return new Map(rows.map((b) => [b.slug, b]));
  }

  /** brandId → id of its current LOGO media row, for the replace path. */
  private async brandsWithLogo(brandIds: string[]): Promise<Map<string, string>> {
    if (!brandIds.length) return new Map();
    const rows = await this.media.findByOwners('BRAND', brandIds);
    const map = new Map<string, string>();
    for (const m of rows) {
      if (m.purpose === 'LOGO' && m.ownerId && !map.has(m.ownerId)) map.set(m.ownerId, m.id);
    }
    return map;
  }
}
