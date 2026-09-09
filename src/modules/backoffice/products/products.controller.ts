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
  Put,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  createProductSchema,
  createVariantSchema,
  listProductsQuerySchema,
  replaceAttributeValuesSchema,
  replaceImagesSchema,
  replaceRelatedSchema,
  updateProductSchema,
  updateProductVariantSchema,
  type CreateProductInput,
  type CreateVariantInput,
  type ListProductsQuery,
  type ReplaceAttributeValuesInput,
  type ReplaceImagesInput,
  type ReplaceRelatedInput,
  type UpdateProductInput,
  type UpdateProductVariantInput,
} from './products.schemas';
import {
  ProductsService,
  type ProductCardView,
  type ProductDetail,
  type ProductImageView,
  type ProductVariantView,
} from './products.service';

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/products`. */
@Controller('backoffice/products')
export class BackofficeProductsController {
  constructor(private readonly products: ProductsService) {}

  @RequirePermissions('products.view')
  @Get()
  list(
    @Query(new ZodValidationPipe(listProductsQuerySchema)) query: ListProductsQuery,
  ): Promise<{ items: ProductCardView[]; total: number; skip: number; take: number }> {
    return this.products.list(query);
  }

  @RequirePermissions('products.view')
  @Get(':id')
  getById(@Param('id') id: string): Promise<ProductDetail> {
    return this.products.getById(id);
  }

  @RequirePermissions('products.manage')
  @Post()
  create(
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput,
  ): Promise<ProductDetail> {
    return this.products.create(body);
  }

  @RequirePermissions('products.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
  ): Promise<ProductDetail> {
    return this.products.update(id, body);
  }

  @RequirePermissions('products.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.products.delete(id);
  }

  @RequirePermissions('products.manage')
  @Put(':id/images')
  replaceImages(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replaceImagesSchema)) body: ReplaceImagesInput,
  ): Promise<ProductImageView[]> {
    return this.products.replaceImages(id, body);
  }

  @RequirePermissions('products.manage')
  @Put(':id/attribute-values')
  replaceAttributeValues(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replaceAttributeValuesSchema)) body: ReplaceAttributeValuesInput,
  ): Promise<ProductDetail['attributeValues']> {
    return this.products.replaceAttributeValues(id, body);
  }

  @RequirePermissions('products.manage')
  @Put(':id/related')
  replaceRelated(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replaceRelatedSchema)) body: ReplaceRelatedInput,
  ): Promise<ProductDetail> {
    return this.products.replaceRelated(id, body);
  }

  @RequirePermissions('products.manage')
  @Post(':id/variants')
  createVariant(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createVariantSchema)) body: CreateVariantInput,
  ): Promise<ProductVariantView> {
    return this.products.createVariant(id, body);
  }

  @RequirePermissions('products.manage')
  @Patch(':productId/variants/:variantId')
  updateVariant(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body(new ZodValidationPipe(updateProductVariantSchema)) body: UpdateProductVariantInput,
  ): Promise<ProductVariantView> {
    return this.products.updateVariant(productId, variantId, body);
  }
}
