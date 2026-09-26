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
  createAttributeGroupSchema,
  createAttributeSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateAttributeGroupSchema,
  updateAttributeSchema,
  updateCategorySchema,
  type CreateAttributeGroupInput,
  type CreateAttributeInput,
  type CreateCategoryInput,
  type ListCategoriesQuery,
  type UpdateAttributeGroupInput,
  type UpdateAttributeInput,
  type UpdateCategoryInput,
} from './categories.schemas';
import {
  CategoriesService,
  type AttributeGroupView,
  type AttributeView,
  type CategoryTreeNode,
  type CategoryView,
} from './categories.service';

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/categories`. */
@Controller('backoffice')
export class BackofficeCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  // ── Categories ───────────────────────────────────────────────────────────

  @RequirePermissions('categories.view')
  @Get('categories')
  list(
    @Query(new ZodValidationPipe(listCategoriesQuerySchema)) query: ListCategoriesQuery,
  ): Promise<{ items: CategoryView[]; total: number; skip: number; take: number }> {
    return this.categories.list(query);
  }

  @RequirePermissions('categories.view')
  @Get('categories/tree')
  tree(): Promise<CategoryTreeNode[]> {
    return this.categories.tree();
  }

  @RequirePermissions('categories.manage')
  @Post('categories')
  create(
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
  ): Promise<CategoryView> {
    return this.categories.create(body);
  }

  @RequirePermissions('categories.manage')
  @Patch('categories/:id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ): Promise<CategoryView> {
    return this.categories.update(id, body);
  }

  @RequirePermissions('categories.manage')
  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.categories.delete(id);
  }

  // ── Attribute groups ─────────────────────────────────────────────────────

  @RequirePermissions('categories.view')
  @Get('categories/:categoryId/attribute-groups')
  listAttributeGroups(@Param('categoryId') categoryId: string): Promise<AttributeGroupView[]> {
    return this.categories.listAttributeGroups(categoryId);
  }

  @RequirePermissions('categories.manage')
  @Post('categories/:categoryId/attribute-groups')
  createAttributeGroup(
    @Param('categoryId') categoryId: string,
    @Body(new ZodValidationPipe(createAttributeGroupSchema)) body: CreateAttributeGroupInput,
  ): Promise<AttributeGroupView> {
    return this.categories.createAttributeGroup(categoryId, body);
  }

  @RequirePermissions('categories.manage')
  @Patch('attribute-groups/:id')
  updateAttributeGroup(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAttributeGroupSchema)) body: UpdateAttributeGroupInput,
  ): Promise<AttributeGroupView> {
    return this.categories.updateAttributeGroup(id, body);
  }

  @RequirePermissions('categories.manage')
  @Delete('attribute-groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAttributeGroup(@Param('id') id: string): Promise<void> {
    await this.categories.deleteAttributeGroup(id);
  }

  // ── Attributes ───────────────────────────────────────────────────────────

  @RequirePermissions('categories.manage')
  @Post('attribute-groups/:groupId/attributes')
  createAttribute(
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(createAttributeSchema)) body: CreateAttributeInput,
  ): Promise<AttributeView> {
    return this.categories.createAttribute(groupId, body);
  }

  @RequirePermissions('categories.manage')
  @Patch('attributes/:id')
  updateAttribute(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAttributeSchema)) body: UpdateAttributeInput,
  ): Promise<AttributeView> {
    return this.categories.updateAttribute(id, body);
  }

  @RequirePermissions('categories.manage')
  @Delete('attributes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAttribute(@Param('id') id: string): Promise<void> {
    await this.categories.deleteAttribute(id);
  }
}
