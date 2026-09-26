import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/token.types';
import {
  listMediaQuerySchema,
  updateMediaSchema,
  uploadMediaSchema,
  type ListMediaQuery,
  type UpdateMediaInput,
  type UploadMediaInput,
} from './media.schemas';
import {
  MAX_UPLOAD_BYTES,
  MediaService,
  type MediaView,
  type UploadedFile as MediaFile,
} from './media.service';

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/media`. */
@Controller('backoffice/media')
export class BackofficeMediaController {
  constructor(private readonly media: MediaService) {}

  /**
   * `multipart/form-data` — `file` (raw file, ≤ 50 MB) plus optional `ownerType`,
   * `ownerId`, `purpose`, `alt`, `isMain`, `sortOrder`, `folder` (schema
   * `uploadMediaSchema`). Stores the file server-side and returns a `MediaView`.
   */
  @RequirePermissions('media.manage')
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @UploadedFile() file: MediaFile | undefined,
    @Body(new ZodValidationPipe(uploadMediaSchema)) body: UploadMediaInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MediaView> {
    return this.media.upload(file, body, user.id);
  }

  /** `media.manage`. Query `ownerType` + `ownerId` → `MediaView[]` for that owner. */
  @RequirePermissions('media.manage')
  @Get()
  list(
    @Query(new ZodValidationPipe(listMediaQuerySchema)) query: ListMediaQuery,
  ): Promise<MediaView[]> {
    return this.media.listByOwner(query);
  }

  /** `media.manage`. Body `{ purpose?, alt?, isMain?, sortOrder? }` → updated `MediaView`. */
  @RequirePermissions('media.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMediaSchema)) body: UpdateMediaInput,
  ): Promise<MediaView> {
    return this.media.update(id, body);
  }

  /** `media.manage`. Removes the row and best-effort deletes the object from storage. */
  @RequirePermissions('media.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.media.delete(id);
  }
}
