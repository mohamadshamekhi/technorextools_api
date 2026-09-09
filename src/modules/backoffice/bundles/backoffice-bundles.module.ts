import { Module } from '@nestjs/common';
import { BackofficeBundlesController } from './backoffice-bundles.controller';
import { BackofficeBundlesService } from './backoffice-bundles.service';

@Module({
  controllers: [BackofficeBundlesController],
  providers: [BackofficeBundlesService],
})
export class BackofficeBundlesModule {}
