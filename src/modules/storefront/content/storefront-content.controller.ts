import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  storefrontListArticlesQuerySchema,
  storefrontObjectIdParamSchema,
  storefrontSeoQuerySchema,
  type StorefrontListArticlesQuery,
  type StorefrontSeoQuery,
} from './storefront-content.schemas';
import {
  StorefrontContentService,
  type StorefrontArticleCardView,
  type StorefrontArticleDetailView,
  type StorefrontBranchView,
  type StorefrontSeoView,
} from './storefront-content.service';

/** Public site — consumed by `abzar/storefront`. Path: `/api/v1/storefront/content`. */
@Controller('storefront/content')
export class StorefrontContentController {
  constructor(private readonly content: StorefrontContentService) {}

  @Public()
  @Get('articles')
  listArticles(
    @Query(new ZodValidationPipe(storefrontListArticlesQuerySchema))
    query: StorefrontListArticlesQuery,
  ): Promise<{
    items: StorefrontArticleCardView[];
    total: number;
    skip: number;
    take: number;
  }> {
    return this.content.listArticles(query);
  }

  @Public()
  @Get('articles/:slug')
  articleDetail(@Param('slug') slug: string): Promise<StorefrontArticleDetailView> {
    return this.content.articleDetail(slug);
  }

  @Public()
  @Get('branches')
  listBranches(): Promise<StorefrontBranchView[]> {
    return this.content.listBranches();
  }

  @Public()
  @Get('branches/:id')
  branchDetail(
    @Param('id', new ZodValidationPipe(storefrontObjectIdParamSchema)) id: string,
  ): Promise<StorefrontBranchView> {
    return this.content.branchDetail(id);
  }

  @Public()
  @Get('seo')
  seo(
    @Query(new ZodValidationPipe(storefrontSeoQuerySchema)) query: StorefrontSeoQuery,
  ): Promise<StorefrontSeoView> {
    return this.content.seoFor(query.entityType, query.entityId);
  }

  @Public()
  @Get('settings/public')
  publicSettings(): Promise<Record<string, string>> {
    return this.content.publicSettings();
  }
}
