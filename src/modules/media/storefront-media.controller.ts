import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/token.types';
import { uploadAttachmentSchema, type UploadAttachmentInput } from './media.schemas';
import {
  MAX_ATTACHMENT_BYTES,
  MediaService,
  type MediaView,
  type UploadedFile as MediaFile,
} from './media.service';

/** Customer uploads — consumed by `abzar/storefront`. Path: `/api/v1/storefront/media`. */
@Controller('storefront/media')
export class StorefrontMediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * `multipart/form-data` — `file` (image/JPEG-PNG-WebP or PDF, ≤ 10 MB) plus an
   * optional `alt` (schema `uploadAttachmentSchema`). Returns a `MediaView` whose
   * `id` is then passed as `mediaIds[]` when creating a ticket message or repair
   * request; the row stays unattached until then.
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  upload(
    @UploadedFile() file: MediaFile | undefined,
    @Body(new ZodValidationPipe(uploadAttachmentSchema)) body: UploadAttachmentInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MediaView> {
    return this.media.uploadAttachment(file, body, user.id);
  }
}
