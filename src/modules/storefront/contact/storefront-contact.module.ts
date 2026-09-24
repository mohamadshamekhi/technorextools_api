import { Module } from '@nestjs/common';
import { StorefrontContactController } from './storefront-contact.controller';
import { StorefrontContactService } from './storefront-contact.service';

@Module({
  controllers: [StorefrontContactController],
  providers: [StorefrontContactService],
})
export class StorefrontContactModule {}
