import { Module } from '@nestjs/common';
import { BackofficeBrandsController } from './brands.controller';
import { BrandsService } from './brands.service';

@Module({
  controllers: [BackofficeBrandsController],
  providers: [BrandsService],
  exports: [BrandsService],
})
export class BackofficeBrandsModule {}
