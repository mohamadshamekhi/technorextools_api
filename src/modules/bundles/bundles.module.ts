import { Global, Module } from '@nestjs/common';
import { BundleRepository } from './repositories/bundle.repository';

/**
 * Bundles domain core — the `bundles` repository (owns `bundle_items` child
 * rows). Shared by the storefront catalog surface and backoffice (CRUD, later).
 */
@Global()
@Module({
  providers: [BundleRepository],
  exports: [BundleRepository],
})
export class BundlesModule {}
