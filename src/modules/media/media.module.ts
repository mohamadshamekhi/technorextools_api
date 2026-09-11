import { Global, Module } from '@nestjs/common';
import { BackofficeMediaController } from './backoffice-media.controller';
import { MediaService } from './media.service';
import { MediaRepository } from './repositories/media.repository';

/**
 * Server-side S3 uploads + the `media` collection. `@Global` (AccessModule
 * pattern) so catalog/content services inject `MediaRepository` to stitch
 * galleries into their views without an explicit import.
 */
@Global()
@Module({
  controllers: [BackofficeMediaController],
  providers: [MediaService, MediaRepository],
  exports: [MediaService, MediaRepository],
})
export class MediaModule {}
