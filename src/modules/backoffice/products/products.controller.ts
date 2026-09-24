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
import type { ProductDocumentView } from '../../catalog/product-extras.view';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  bulkUpdatePriceSchema,
  createProductSchema,
  createVariantSchema,
  listProductsQuerySchema,
  replaceAttributeValuesSchema,
  createProductDocumentSchema,
  replaceHighlightsSchema,
  replaceModel3dHotspotsSchema,
  replacePartsSchema,
  updateProductDocumentSchema,
  replaceRelatedSchema,
  updateProductSchema,
  updateProductVariantSchema,
  type BulkUpdatePriceInput,
  type CreateProductInput,
  type CreateVariantInput,
  type ListProductsQuery,
  type ReplaceAttributeValuesInput,
  type CreateProductDocumentInput,
  type ReplaceHighlightsInput,
  type ReplaceModel3dHotspotsInput,
  type ReplacePartsInput,
  type UpdateProductDocumentInput,
  type ReplaceRelatedInput,
  type UpdateProductInput,
  type UpdateProductVariantInput,
} from './products.schemas';
import {
  ProductsService,
  type BulkPriceUpdateResult,
  type ProductCardView,
  type ProductDetail,
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
  @Put(':id/parts')
  replaceParts(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replacePartsSchema)) body: ReplacePartsInput,
  ): Promise<ProductDetail> {
    return this.products.replaceParts(id, body);
  }

  @RequirePermissions('products.manage')
  @Put(':id/highlights')
  replaceHighlights(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replaceHighlightsSchema)) body: ReplaceHighlightsInput,
  ): Promise<ProductDetail> {
    return this.products.replaceHighlights(id, body);
  }

  @RequirePermissions('products.manage')
  @Put(':id/model3d-hotspots')
  replaceModel3dHotspots(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replaceModel3dHotspotsSchema)) body: ReplaceModel3dHotspotsInput,
  ): Promise<ProductDetail> {
    return this.products.replaceModel3dHotspots(id, body);
  }

  @RequirePermissions('products.view')
  @Get(':id/documents')
  listDocuments(@Param('id') id: string): Promise<ProductDocumentView[]> {
    return this.products.listDocuments(id);
  }

  @RequirePermissions('products.manage')
  @Post(':id/documents')
  addDocument(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createProductDocumentSchema)) body: CreateProductDocumentInput,
  ): Promise<ProductDocumentView[]> {
    return this.products.addDocument(id, body);
  }

  @RequirePermissions('products.manage')
  @Patch(':id/documents/:documentId')
  updateDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(updateProductDocumentSchema)) body: UpdateProductDocumentInput,
  ): Promise<ProductDocumentView[]> {
    return this.products.updateDocument(id, documentId, body);
  }

  @RequirePermissions('products.manage')
  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDocument(@Param('id') id: string, @Param('documentId') documentId: string): Promise<void> {
    return this.products.deleteDocument(id, documentId);
  }

  @RequirePermissions('products.manage')
  @Post('bulk-price-update')
  bulkUpdatePrices(
    @Body(new ZodValidationPipe(bulkUpdatePriceSchema)) body: BulkUpdatePriceInput,
  ): Promise<BulkPriceUpdateResult> {
    return this.products.bulkUpdatePrices(body);
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
