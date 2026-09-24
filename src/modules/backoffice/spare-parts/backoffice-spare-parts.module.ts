import { Module } from '@nestjs/common';
import {
  BackofficeProductSparePartsController,
  BackofficeSparePartsController,
} from './backoffice-spare-parts.controller';
import { BackofficeSparePartsService } from './backoffice-spare-parts.service';

@Module({
  controllers: [BackofficeSparePartsController, BackofficeProductSparePartsController],
  providers: [BackofficeSparePartsService],
})
export class BackofficeSparePartsModule {}
