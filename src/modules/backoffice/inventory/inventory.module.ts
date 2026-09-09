import { Module } from '@nestjs/common';
import { BackofficeInventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [BackofficeInventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class BackofficeInventoryModule {}
