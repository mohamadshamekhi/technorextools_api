import { Module } from '@nestjs/common';
import { BackofficeInboxController } from './backoffice-inbox.controller';
import { BackofficeInboxService } from './backoffice-inbox.service';

@Module({
  controllers: [BackofficeInboxController],
  providers: [BackofficeInboxService],
})
export class BackofficeInboxModule {}
