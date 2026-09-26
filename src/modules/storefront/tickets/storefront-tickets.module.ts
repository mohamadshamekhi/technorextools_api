import { Module } from '@nestjs/common';
import { StorefrontTicketsController } from './storefront-tickets.controller';
import { StorefrontTicketsService } from './storefront-tickets.service';

@Module({
  controllers: [StorefrontTicketsController],
  providers: [StorefrontTicketsService],
})
export class StorefrontTicketsModule {}
