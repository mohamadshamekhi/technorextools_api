import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ArticleRepository } from '../../content/repositories/article.repository';
import { BranchRepository } from '../../content/repositories/branch.repository';
import { SeoMetaRepository } from '../../content/repositories/seo-meta.repository';
import { SiteSettingRepository } from '../../content/repositories/site-setting.repository';
import type { StorefrontListArticlesQuery } from './storefront-content.schemas';

/** Site settings exposed to unauthenticated clients: this key + any `public_*`. */
const ALWAYS_PUBLIC_SETTING_KEYS = ['site_title'];

export interface StorefrontArticleCardView {
  title: string;
  slug: string;
  coverImage: string | null;
  excerpt: string | null;
  publishedAt: Date | null;
}

export interface StorefrontArticleDetailView extends StorefrontArticleCardView {
  id: string;
  body: string;
}

export interface StorefrontBranchView {
  id: string;
  title: string;
  address: string;
  phone: string;
  workingHours: string | null;
  isWholesalePoint: boolean;
}

export interface StorefrontSeoView {
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
}

@Injectable()
export class StorefrontContentService {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly branches: BranchRepository,
    private readonly seo: SeoMetaRepository,
    private readonly settings: SiteSettingRepository,
  ) {}

  async listArticles(query: StorefrontListArticlesQuery): Promise<{
    items: StorefrontArticleCardView[];
    total: number;
    skip: number;
    take: number;
  }> {
    const where: Prisma.ArticleWhereInput = { publishedAt: { not: null, lte: new Date() } };
    const [rows, total] = await this.articles.paginate(where, query.skip, query.take, {
      publishedAt: 'desc',
    });
    return {
      items: rows.map((a) => ({
        title: a.title,
        slug: a.slug,
        coverImage: a.coverImage,
        excerpt: a.excerpt,
        publishedAt: a.publishedAt,
      })),
      total,
      skip: query.skip,
      take: query.take,
    };
  }

  async articleDetail(slug: string): Promise<StorefrontArticleDetailView> {
    const article = await this.articles.findBySlug(slug);
    if (!article || article.publishedAt === null || article.publishedAt > new Date()) {
      throw new NotFoundException('مقاله یافت نشد');
    }
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      coverImage: article.coverImage,
      excerpt: article.excerpt,
      publishedAt: article.publishedAt,
      body: article.body,
    };
  }

  async listBranches(): Promise<StorefrontBranchView[]> {
    const rows = await this.branches.findMany();
    return rows.map(toBranchView);
  }

  async branchDetail(id: string): Promise<StorefrontBranchView> {
    const branch = await this.branches.findById(id);
    if (!branch) {
      throw new NotFoundException('شعبه یافت نشد');
    }
    return toBranchView(branch);
  }

  async seoFor(entityType: string, entityId: string): Promise<StorefrontSeoView> {
    const meta = await this.seo.findByEntity(entityType, entityId);
    return {
      metaTitle: meta?.metaTitle ?? null,
      metaDescription: meta?.metaDescription ?? null,
      ogImage: meta?.ogImage ?? null,
      canonicalUrl: meta?.canonicalUrl ?? null,
    };
  }

  async publicSettings(): Promise<Record<string, string>> {
    const rows = await this.settings.findAll();
    const out: Record<string, string> = {};
    for (const row of rows) {
      if (ALWAYS_PUBLIC_SETTING_KEYS.includes(row.key) || row.key.startsWith('public_')) {
        out[row.key] = row.value;
      }
    }
    return out;
  }
}

function toBranchView(branch: {
  id: string;
  title: string;
  address: string;
  phone: string;
  workingHours: string | null;
  isWholesalePoint: boolean;
}): StorefrontBranchView {
  return {
    id: branch.id,
    title: branch.title,
    address: branch.address,
    phone: branch.phone,
    workingHours: branch.workingHours,
    isWholesalePoint: branch.isWholesalePoint,
  };
}
