import { Global, Module } from '@nestjs/common';
import { AccountingPostingService } from './accounting-posting.service';
import { FinanceAccountRepository } from './repositories/finance-account.repository';
import { FinanceCategoryRepository } from './repositories/finance-category.repository';
import { FinanceTransactionRepository } from './repositories/finance-transaction.repository';

/**
 * Accounting domain core — the `finance_*` repositories and the automatic order postings
 * (`AccountingPostingService`, called by `OrdersService`). `@Global` so the orders core can
 * inject it without importing the backoffice surface.
 */
@Global()
@Module({
  providers: [
    FinanceAccountRepository,
    FinanceCategoryRepository,
    FinanceTransactionRepository,
    AccountingPostingService,
  ],
  exports: [
    FinanceAccountRepository,
    FinanceCategoryRepository,
    FinanceTransactionRepository,
    AccountingPostingService,
  ],
})
export class AccountingModule {}
