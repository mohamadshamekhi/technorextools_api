import { Module } from '@nestjs/common';
import { BackofficeShippingController } from './backoffice-shipping.controller';
import { BackofficeShippingService } from './backoffice-shipping.service';

@Module({
  controllers: [BackofficeShippingController],
  providers: [BackofficeShippingService],
})
export class BackofficeShippingModule {}
