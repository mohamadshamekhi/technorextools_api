import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  createArticleSchema,
  createBranchSchema,
  listArticlesQuerySchema,
  updateArticleSchema,
  updateBranchSchema,
  upsertSeoSchema,
  type CreateArticleInput,
  type CreateBranchInput,
  type ListArticlesQuery,
  type UpdateArticleInput,
  type UpdateBranchInput,
  type UpsertSeoInput,
} from './backoffice-content.schemas';
import { BackofficeContentService } from './backoffice-content.service';

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/content`. */
@Controller('backoffice/content')
export class BackofficeContentController {
  constructor(private readonly content: BackofficeContentService) {}

  // ── articles ──
  @RequirePermissions('articles.manage')
  @Get('articles')
  listArticles(@Query(new ZodValidationPipe(listArticlesQuerySchema)) query: ListArticlesQuery) {
    return this.content.listArticles(query);
  }

  @RequirePermissions('articles.manage')
  @Get('articles/:id')
  getArticle(@Param('id') id: string) {
    return this.content.getArticle(id);
  }

  @RequirePermissions('articles.manage')
  @Post('articles')
  createArticle(@Body(new ZodValidationPipe(createArticleSchema)) body: CreateArticleInput) {
    return this.content.createArticle(body);
  }

  @RequirePermissions('articles.manage')
  @Patch('articles/:id')
  updateArticle(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateArticleSchema)) body: UpdateArticleInput,
  ) {
    return this.content.updateArticle(id, body);
  }

  @RequirePermissions('articles.manage')
  @Delete('articles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteArticle(@Param('id') id: string): Promise<void> {
    await this.content.deleteArticle(id);
  }

  // ── branches ──
  @RequirePermissions('branches.manage')
  @Get('branches')
  listBranches() {
    return this.content.listBranches();
  }

  @RequirePermissions('branches.manage')
  @Post('branches')
  createBranch(@Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchInput) {
    return this.content.createBranch(body);
  }

  @RequirePermissions('branches.manage')
  @Patch('branches/:id')
  updateBranch(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranchInput,
  ) {
    return this.content.updateBranch(id, body);
  }

  @RequirePermissions('branches.manage')
  @Delete('branches/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBranch(@Param('id') id: string): Promise<void> {
    await this.content.deleteBranch(id);
  }

  // ── seo ──
  @RequirePermissions('articles.manage')
  @Get('seo')
  getSeo(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.content.getSeo(entityType, entityId);
  }

  @RequirePermissions('articles.manage')
  @Post('seo')
  upsertSeo(@Body(new ZodValidationPipe(upsertSeoSchema)) body: UpsertSeoInput) {
    return this.content.upsertSeo(body);
  }
}
