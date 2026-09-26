import { Global, Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyTransactionRepository } from './repositories/loyalty-transaction.repository';

/**
 * Loyalty domain core — the `loyalty_transactions` repository and the ledger
 * service. Consumed by checkout, the order lifecycle, the customer panel, and
 * backoffice manual adjustments.
 */
@Global()
@Module({
  providers: [LoyaltyTransactionRepository, LoyaltyService],
  exports: [LoyaltyTransactionRepository, LoyaltyService],
})
export class LoyaltyModule {}
