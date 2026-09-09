import { Global, Module } from '@nestjs/common';
import { RepairRequestRepository } from './repositories/repair-request.repository';
import { WarrantyRepository } from './repositories/warranty.repository';

/**
 * Warranty domain core — the `warranties` and `repair_requests` repositories.
 * Consumed by the public serial lookup, the customer panel (my repairs) and
 * the backoffice (issue warranty, manage repairs).
 */
@Global()
@Module({
  providers: [WarrantyRepository, RepairRequestRepository],
  exports: [WarrantyRepository, RepairRequestRepository],
})
export class WarrantyModule {}
