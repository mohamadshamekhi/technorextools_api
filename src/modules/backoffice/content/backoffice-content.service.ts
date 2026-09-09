import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ArticleRepository } from '../../content/repositories/article.repository';
import { BranchRepository } from '../../content/repositories/branch.repository';
import { SeoMetaRepository } from '../../content/repositories/seo-meta.repository';
import type {
  CreateArticleInput,
  CreateBranchInput,
  ListArticlesQuery,
  UpdateArticleInput,
  UpdateBranchInput,
  UpsertSeoInput,
} from './backoffice-content.schemas';

@Injectable()
export class BackofficeContentService {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly branches: BranchRepository,
    private readonly seo: SeoMetaRepository,
  ) {}

  async listArticles(query: ListArticlesQuery) {
    const [items, total] = await this.articles.paginate({}, query.skip, query.take);
    return { items, total, skip: query.skip, take: query.take };
  }

  async getArticle(id: string) {
    const article = await this.articles.findById(id);
    if (!article) throw new NotFoundException('مقاله یافت نشد');
    return article;
  }

  async createArticle(input: CreateArticleInput) {
    if (await this.articles.findBySlug(input.slug)) {
      throw new BadRequestException('این اسلاگ قبلاً استفاده شده است');
    }
    return this.articles.create(input);
  }

  async updateArticle(id: string, input: UpdateArticleInput) {
    await this.getArticle(id);
    if (input.slug) {
      const bySlug = await this.articles.findBySlug(input.slug);
      if (bySlug && bySlug.id !== id) throw new BadRequestException('این اسلاگ قبلاً استفاده شده است');
    }
    return this.articles.update(id, input);
  }

  async deleteArticle(id: string): Promise<void> {
    await this.getArticle(id);
    await this.articles.delete(id);
  }

  listBranches() {
    return this.branches.findMany();
  }

  createBranch(input: CreateBranchInput) {
    return this.branches.create(input);
  }

  async updateBranch(id: string, input: UpdateBranchInput) {
    if (!(await this.branches.findById(id))) throw new NotFoundException('شعبه یافت نشد');
    return this.branches.update(id, input);
  }

  async deleteBranch(id: string): Promise<void> {
    if (!(await this.branches.findById(id))) throw new NotFoundException('شعبه یافت نشد');
    await this.branches.delete(id);
  }

  getSeo(entityType: string, entityId: string) {
    return this.seo.findByEntity(entityType, entityId);
  }

  upsertSeo(input: UpsertSeoInput) {
    const { entityType, entityId, ...rest } = input;
    return this.seo.upsert(entityType, entityId, rest);
  }
}
