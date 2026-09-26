import { Module } from '@nestjs/common';
import { BackofficeSettingsController } from './backoffice-settings.controller';
import { BackofficeSettingsService } from './backoffice-settings.service';

@Module({
  controllers: [BackofficeSettingsController],
  providers: [BackofficeSettingsService],
})
export class BackofficeSettingsModule {}
