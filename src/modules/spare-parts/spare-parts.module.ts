import { Global, Module } from '@nestjs/common';
import { SparePartRepository } from './repositories/spare-part.repository';

/**
 * Spare-parts domain core — the `spare_parts` repository (owns the
 * `spare_part_compatibilities` junction). Shared by backoffice, storefront,
 * cart, checkout and orders.
 */
@Global()
@Module({
  providers: [SparePartRepository],
  exports: [SparePartRepository],
})
export class SparePartsModule {}
