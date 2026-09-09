import { Global, Module } from '@nestjs/common';
import { DiscountEvaluatorService } from './discount-evaluator.service';
import { DiscountRepository } from './repositories/discount.repository';
import { DiscountUsageRepository } from './repositories/discount-usage.repository';

/**
 * Discounts domain core — the `discounts` repository (owns `discount_targets`),
 * the `discount_usages` repository, and the shared code evaluator. Consumed by
 * the storefront validate endpoint, checkout, and backoffice discount admin.
 */
@Global()
@Module({
  providers: [DiscountRepository, DiscountUsageRepository, DiscountEvaluatorService],
  exports: [DiscountRepository, DiscountUsageRepository, DiscountEvaluatorService],
})
export class DiscountsModule {}
