import { Module } from '@nestjs/common';
import {
  BackofficeRepairsController,
  BackofficeWarrantiesController,
} from './backoffice-warranties.controller';
import { BackofficeWarrantiesService } from './backoffice-warranties.service';

@Module({
  controllers: [BackofficeWarrantiesController, BackofficeRepairsController],
  providers: [BackofficeWarrantiesService],
})
export class BackofficeWarrantiesModule {}
