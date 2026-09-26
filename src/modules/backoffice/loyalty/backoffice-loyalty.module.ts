import { Module } from '@nestjs/common';
import { BackofficeLoyaltyController } from './backoffice-loyalty.controller';
import { BackofficeLoyaltyService } from './backoffice-loyalty.service';

@Module({
  controllers: [BackofficeLoyaltyController],
  providers: [BackofficeLoyaltyService],
})
export class BackofficeLoyaltyModule {}
