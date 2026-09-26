import { Module } from '@nestjs/common';
import { BackofficeCategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [BackofficeCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class BackofficeCategoriesModule {}
