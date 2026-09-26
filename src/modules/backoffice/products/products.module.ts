import { Module } from '@nestjs/common';
import { BackofficeProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [BackofficeProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class BackofficeProductsModule {}
