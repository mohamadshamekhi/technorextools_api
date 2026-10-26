import { Module } from '@nestjs/common';
import { AdminSeenMarkerRepository } from './admin-seen-marker.repository';
import { BackofficeBadgesController } from './backoffice-badges.controller';
import { BackofficeBadgesService } from './backoffice-badges.service';

@Module({
  controllers: [BackofficeBadgesController],
  providers: [BackofficeBadgesService, AdminSeenMarkerRepository],
})
export class BackofficeBadgesModule {}
