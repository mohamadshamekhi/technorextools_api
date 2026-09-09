import { Module } from '@nestjs/common';
import { BackofficeContentController } from './backoffice-content.controller';
import { BackofficeContentService } from './backoffice-content.service';

@Module({
  controllers: [BackofficeContentController],
  providers: [BackofficeContentService],
})
export class BackofficeContentModule {}
