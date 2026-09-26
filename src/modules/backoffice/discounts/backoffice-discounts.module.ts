import { Module } from '@nestjs/common';
import { BackofficeDiscountsController } from './backoffice-discounts.controller';
import { BackofficeDiscountsService } from './backoffice-discounts.service';

@Module({
  controllers: [BackofficeDiscountsController],
  providers: [BackofficeDiscountsService],
})
export class BackofficeDiscountsModule {}
