import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { ProductQuestionView } from '../../catalog/product-extras.view';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import {
  storefrontCreateCommentSchema,
  storefrontCreateQuestionSchema,
  storefrontListCommentsQuerySchema,
  storefrontListProductsQuerySchema,
  type StorefrontCreateCommentInput,
  type StorefrontCreateQuestionInput,
  type StorefrontListCommentsQuery,
  type StorefrontListProductsQuery,
} from './storefront-catalog.schemas';
import {
  StorefrontCatalogService,
  type StorefrontBrandView,
  type StorefrontBundleView,
  type StorefrontCategoryNode,
  type StorefrontCommentView,
  type StorefrontProductCardView,
  type StorefrontProductDetailView,
} from './storefront-catalog.service';

/** Public site — consumed by `abzar/storefront`. Path: `/api/v1/storefront/catalog`. */
@Controller('storefront/catalog')
export class StorefrontCatalogController {
  constructor(private readonly catalog: StorefrontCatalogService) {}

  @Public()
  @Get('categories')
  categoryTree(): Promise<StorefrontCategoryNode[]> {
    return this.catalog.categoryTree();
  }

  @Public()
  @Get('brands')
  listBrands(): Promise<StorefrontBrandView[]> {
    return this.catalog.listBrands();
  }

  @Public()
  @Get('products')
  listProducts(
    @Query(new ZodValidationPipe(storefrontListProductsQuerySchema))
    query: StorefrontListProductsQuery,
  ): Promise<{ items: StorefrontProductCardView[]; total: number; skip: number; take: number }> {
    return this.catalog.listProducts(query);
  }

  @Public()
  @Get('products/:slug')
  productDetail(@Param('slug') slug: string): Promise<StorefrontProductDetailView> {
    return this.catalog.productDetail(slug);
  }

  @Public()
  @Get('products/:slug/comments')
  productComments(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(storefrontListCommentsQuerySchema))
    query: StorefrontListCommentsQuery,
  ): Promise<{
    items: StorefrontCommentView[];
    total: number;
    skip: number;
    take: number;
    averageRating: number | null;
  }> {
    return this.catalog.productComments(slug, query);
  }

  @Post('products/:slug/comments')
  addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(storefrontCreateCommentSchema)) body: StorefrontCreateCommentInput,
  ): Promise<{ status: 'pending' }> {
    return this.catalog.addComment(user.id, slug, body);
  }

  @Public()
  @Get('products/:slug/questions')
  productQuestions(@Param('slug') slug: string): Promise<ProductQuestionView[]> {
    return this.catalog.productQuestions(slug);
  }

  @Post('products/:slug/questions')
  addQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(storefrontCreateQuestionSchema))
    body: StorefrontCreateQuestionInput,
  ): Promise<{ status: 'pending' }> {
    return this.catalog.addQuestion(user.id, slug, body.question);
  }

  @Public()
  @Get('bundles')
  listBundles(): Promise<StorefrontBundleView[]> {
    return this.catalog.listBundles();
  }

  @Public()
  @Get('bundles/:slug')
  bundleDetail(@Param('slug') slug: string): Promise<StorefrontBundleView> {
    return this.catalog.bundleDetail(slug);
  }
}
