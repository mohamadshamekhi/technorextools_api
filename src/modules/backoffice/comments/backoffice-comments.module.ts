import { Module } from '@nestjs/common';
import { BackofficeCommentsController } from './backoffice-comments.controller';
import { BackofficeCommentsService } from './backoffice-comments.service';

@Module({
  controllers: [BackofficeCommentsController],
  providers: [BackofficeCommentsService],
})
export class BackofficeCommentsModule {}
