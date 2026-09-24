import { Module } from '@nestjs/common';
import { BackofficeBrandsController } from './brands.controller';
import { BrandsImportService } from './brands-import.service';
import { BrandsService } from './brands.service';

@Module({
  controllers: [BackofficeBrandsController],
  providers: [BrandsService, BrandsImportService],
  exports: [BrandsService],
})
export class BackofficeBrandsModule {}
