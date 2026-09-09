import { Global, Module } from '@nestjs/common';
import { AttributeGroupRepository } from './repositories/attribute-group.repository';
import { CommentRepository } from './repositories/comment.repository';
import { AttributeRepository } from './repositories/attribute.repository';
import { BrandRepository } from './repositories/brand.repository';
import { CategoryRepository } from './repositories/category.repository';
import { ProductRepository } from './repositories/product.repository';
import { ProductVariantRepository } from './repositories/product-variant.repository';

/**
 * Catalog domain core — repositories shared by the backoffice catalog modules
 * and the storefront catalog module. Follows the AccessModule pattern: a
 * @Global module so consumers inject repositories without an explicit import.
 */
@Global()
@Module({
  providers: [
    CategoryRepository,
    AttributeGroupRepository,
    AttributeRepository,
    BrandRepository,
    ProductRepository,
    ProductVariantRepository,
    CommentRepository,
  ],
  exports: [
    CategoryRepository,
    AttributeGroupRepository,
    AttributeRepository,
    BrandRepository,
    ProductRepository,
    ProductVariantRepository,
    CommentRepository,
  ],
})
export class CatalogModule {}
