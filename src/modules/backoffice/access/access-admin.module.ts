import { Module } from '@nestjs/common';
import { BackofficeAccessController } from './access-admin.controller';
import { AccessAdminService } from './access-admin.service';

@Module({
  controllers: [BackofficeAccessController],
  providers: [AccessAdminService],
})
export class BackofficeAccessModule {}
