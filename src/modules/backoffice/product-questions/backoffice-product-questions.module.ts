import { Module } from '@nestjs/common';
import { BackofficeProductQuestionsController } from './backoffice-product-questions.controller';
import { BackofficeProductQuestionsService } from './backoffice-product-questions.service';

@Module({
  controllers: [BackofficeProductQuestionsController],
  providers: [BackofficeProductQuestionsService],
})
export class BackofficeProductQuestionsModule {}
